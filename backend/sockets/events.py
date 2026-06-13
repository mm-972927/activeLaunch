import socketio
import httpx
import redis.asyncio as aioredis
import json
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.database import AsyncSessionLocal
from models.models import (
    Session, SessionStatus, Participant, ParticipantRole,
    ChatMessage, MessageType, SessionEvent, Recording, RecordingStatus
)
from services.session_service import log_event
from services.recording_service import start_recording, stop_recording
from config import settings
from observability.metrics import (
    active_sessions_gauge, connected_participants_gauge,
    messages_sent_counter, reconnects_counter
)
import structlog

log = structlog.get_logger()

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[settings.FRONTEND_URL, "*"],
    logger=False,
    engineio_logger=False,
)

redis_client: aioredis.Redis = None


async def get_redis():
    global redis_client
    if redis_client is None:
        redis_client = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return redis_client


# ── Helpers ────────────────────────────────────────────────────────────────

async def get_session_participants(session_id: str):
    r = await get_redis()
    raw = await r.hgetall(f"session:{session_id}:participants")
    return {sid: json.loads(v) for sid, v in raw.items()}


async def set_participant(session_id: str, socket_id: str, data: dict):
    r = await get_redis()
    await r.hset(f"session:{session_id}:participants", socket_id, json.dumps(data))


async def remove_participant(session_id: str, socket_id: str):
    r = await get_redis()
    await r.hdel(f"session:{session_id}:participants", socket_id)


async def set_grace_window(session_id: str, socket_id: str, participant_data: dict):
    """Store participant data for reconnect grace window."""
    r = await get_redis()
    key = f"grace:{session_id}:{participant_data['display_name']}"
    await r.setex(key, settings.RECONNECT_GRACE_SECONDS, json.dumps({
        **participant_data,
        "old_socket_id": socket_id,
    }))


async def get_grace_window(session_id: str, display_name: str) -> dict | None:
    r = await get_redis()
    raw = await r.get(f"grace:{session_id}:{display_name}")
    return json.loads(raw) if raw else None


async def clear_grace_window(session_id: str, display_name: str):
    r = await get_redis()
    await r.delete(f"grace:{session_id}:{display_name}")


# ── Connection Events ──────────────────────────────────────────────────────

@sio.event
async def connect(sid, environ, auth):
    log.info("Socket connected", sid=sid)


@sio.event
async def disconnect(sid):
    log.info("Socket disconnected", sid=sid)

    r = await get_redis()
    # Find which session this socket was in
    session_id = await r.get(f"socket:{sid}:session")
    if not session_id:
        return

    participants = await get_session_participants(session_id)
    participant_data = participants.get(sid)
    if not participant_data:
        return

    await remove_participant(session_id, sid)
    await r.delete(f"socket:{sid}:session")

    # Set grace window — notify others only after it expires
    await set_grace_window(session_id, sid, participant_data)
    connected_participants_gauge.dec()

    # Schedule expiry notification via a background task
    async def notify_leave_after_grace():
        import asyncio
        await asyncio.sleep(settings.RECONNECT_GRACE_SECONDS + 1)
        grace = await get_grace_window(session_id, participant_data["display_name"])
        if grace:  # Grace window still present = no reconnect happened
            await clear_grace_window(session_id, participant_data["display_name"])
            await sio.emit("participant-left", {
                "display_name": participant_data["display_name"],
                "role": participant_data["role"],
            }, room=session_id)

            async with AsyncSessionLocal() as db:
                await log_event(db, session_id, "participant_left",
                                participant_data["display_name"])
                await db.commit()
            log.info("Grace window expired — participant left",
                     display_name=participant_data["display_name"])

    import asyncio
    asyncio.create_task(notify_leave_after_grace())


# ── Session Events ─────────────────────────────────────────────────────────

@sio.event
async def join_session(sid, data):
    session_id = data.get("session_id")
    invite_token = data.get("invite_token")
    display_name = data.get("display_name", "Guest")
    role = data.get("role", "customer")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()

        if not session:
            await sio.emit("error", {"message": "Session not found"}, to=sid)
            return

        if role == "customer" and session.invite_token != invite_token:
            await sio.emit("error", {"message": "Invalid invite token"}, to=sid)
            return

        if session.status == SessionStatus.ended:
            await sio.emit("error", {"message": "Session has ended"}, to=sid)
            return

        # Check if this is a reconnect within grace window
        grace_data = await get_grace_window(session_id, display_name)
        is_reconnect = grace_data is not None
        if is_reconnect:
            await clear_grace_window(session_id, display_name)
            reconnects_counter.inc()
            log.info("Reconnect within grace window", display_name=display_name)

        # Activate session on first join
        if session.status == SessionStatus.waiting:
            session.status = SessionStatus.active
            session.started_at = datetime.utcnow()
            active_sessions_gauge.inc()
            await db.commit()

        # Add to socket room
        await sio.enter_room(sid, session_id)

        # Store in Redis
        r = await get_redis()
        participant_data = {
            "display_name": display_name,
            "role": role,
            "session_id": session_id,
        }
        await set_participant(session_id, sid, participant_data)
        await r.set(f"socket:{sid}:session", session_id)
        connected_participants_gauge.inc()

        # Persist to DB if new join
        if not is_reconnect:
            participant = Participant(
                session_id=session_id,
                display_name=display_name,
                role=ParticipantRole.agent if role == "agent" else ParticipantRole.customer,
                socket_id=sid,
            )
            db.add(participant)
            await log_event(db, session_id, "participant_joined", display_name)
            await db.commit()

        # Get all current participants
        all_participants = await get_session_participants(session_id)
        participant_list = [
            {"display_name": v["display_name"], "role": v["role"]}
            for v in all_participants.values()
        ]

        # Notify the joining user
        await sio.emit("session-joined", {
            "session_id": session_id,
            "display_name": display_name,
            "participants": participant_list,
            "is_reconnect": is_reconnect,
        }, to=sid)

        # Notify others (only if not a silent reconnect)
        if not is_reconnect:
            await sio.emit("participant-joined", {
                "display_name": display_name,
                "role": role,
            }, room=session_id, skip_sid=sid)

        log.info("Participant joined session",
                 display_name=display_name, session_id=session_id, reconnect=is_reconnect)


@sio.event
async def leave_session(sid, data):
    session_id = data.get("session_id")
    r = await get_redis()
    participants = await get_session_participants(session_id)
    participant_data = participants.get(sid, {})
    display_name = participant_data.get("display_name", "Unknown")

    await remove_participant(session_id, sid)
    await r.delete(f"socket:{sid}:session")
    await sio.leave_room(sid, session_id)
    connected_participants_gauge.dec()

    await sio.emit("participant-left", {
        "display_name": display_name,
        "role": participant_data.get("role"),
    }, room=session_id)

    async with AsyncSessionLocal() as db:
        await log_event(db, session_id, "participant_left", display_name)
        await db.commit()


# ── WebRTC Signaling (mediasoup) ───────────────────────────────────────────

@sio.event
async def get_rtp_capabilities(sid, data):
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{settings.MEDIA_SERVER_URL}/rtp-capabilities")
        await sio.emit("rtp-capabilities", resp.json(), to=sid)


@sio.event
async def create_transport(sid, data):
    r = await get_redis()
    session_id = await r.get(f"socket:{sid}:session")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.MEDIA_SERVER_URL}/transport/create",
            json={"session_id": session_id, "direction": data.get("direction")},
        )
        await sio.emit("transport-created", resp.json(), to=sid)


@sio.event
async def connect_transport(sid, data):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.MEDIA_SERVER_URL}/transport/connect",
            json=data,
        )
        await sio.emit("transport-connected", resp.json(), to=sid)


@sio.event
async def produce(sid, data):
    r = await get_redis()
    session_id = await r.get(f"socket:{sid}:session")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.MEDIA_SERVER_URL}/produce",
            json={**data, "session_id": session_id, "socket_id": sid},
        )
        result = resp.json()
        # Notify others in the room to consume this new producer
        await sio.emit("new-producer", {
            "producer_id": result["producer_id"],
            "socket_id": sid,
        }, room=session_id, skip_sid=sid)
        await sio.emit("produced", result, to=sid)


@sio.event
async def consume(sid, data):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.MEDIA_SERVER_URL}/consume",
            json={**data, "socket_id": sid},
        )
        await sio.emit("consumed", resp.json(), to=sid)


@sio.event
async def resume_consumer(sid, data):
    async with httpx.AsyncClient() as client:
        await client.post(f"{settings.MEDIA_SERVER_URL}/consumer/resume", json=data)


# ── Chat Events ────────────────────────────────────────────────────────────

@sio.event
async def send_message(sid, data):
    session_id = data.get("session_id")
    message = data.get("message", "")
    sender_name = data.get("sender_name", "Unknown")
    sender_role = data.get("sender_role", "customer")

    async with AsyncSessionLocal() as db:
        msg = ChatMessage(
            session_id=session_id,
            sender_name=sender_name,
            sender_role=sender_role,
            message=message,
            message_type=MessageType.text,
        )
        db.add(msg)
        await db.flush()
        await db.refresh(msg)
        await db.commit()
        messages_sent_counter.inc()

    await sio.emit("new-message", {
        "id": msg.id,
        "sender_name": sender_name,
        "sender_role": sender_role,
        "message": message,
        "message_type": "text",
        "created_at": msg.created_at.isoformat(),
    }, room=session_id)


@sio.event
async def send_file_message(sid, data):
    """Emitted after a file is uploaded via REST — broadcasts to room."""
    session_id = data.get("session_id")
    await sio.emit("new-message", {
        "sender_name": data.get("sender_name"),
        "sender_role": data.get("sender_role"),
        "message": None,
        "file_url": data.get("file_url"),
        "file_name": data.get("file_name"),
        "message_type": "file",
        "created_at": datetime.utcnow().isoformat(),
    }, room=session_id)


# ── Recording Control Events ───────────────────────────────────────────────

@sio.event
async def start_recording_event(sid, data):
    session_id = data.get("session_id")
    r = await get_redis()
    participants = await get_session_participants(session_id)
    participant_data = participants.get(sid, {})
    if participant_data.get("role") != "agent":
        await sio.emit("error", {"message": "Only agents can start recording"}, to=sid)
        return

    async with AsyncSessionLocal() as db:
        recording = await start_recording(db, session_id)
        await db.commit()

    await sio.emit("recording-started", {"recording_id": recording.id}, room=session_id)
    log.info("Recording started via socket", session_id=session_id)


@sio.event
async def stop_recording_event(sid, data):
    recording_id = data.get("recording_id")
    session_id = data.get("session_id")

    async with AsyncSessionLocal() as db:
        recording = await stop_recording(db, recording_id)
        await db.commit()

    await sio.emit("recording-stopped", {"recording_id": recording_id}, room=session_id)
    log.info("Recording stopped via socket", recording_id=recording_id)


# ── Session End ────────────────────────────────────────────────────────────

@sio.event
async def end_session_event(sid, data):
    session_id = data.get("session_id")
    r = await get_redis()
    participants = await get_session_participants(session_id)
    participant_data = participants.get(sid, {})

    if participant_data.get("role") != "agent":
        await sio.emit("error", {"message": "Only agents can end sessions"}, to=sid)
        return

    async with AsyncSessionLocal() as db:
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Session).where(Session.id == session_id)
            .options(selectinload(Session.participants))
        )
        session = result.scalar_one_or_none()
        if session:
            from services.session_service import end_session
            await end_session(db, session, participant_data.get("display_name", "Agent"))
            await db.commit()

    await sio.emit("session-ended", {}, room=session_id)
    log.info("Session ended via socket", session_id=session_id)
