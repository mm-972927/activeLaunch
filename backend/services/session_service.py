import secrets
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models.models import Session, SessionStatus, SessionEvent, Participant
from observability.metrics import active_sessions_gauge, sessions_created_counter, sessions_ended_counter


def generate_invite_token() -> str:
    return secrets.token_urlsafe(32)


async def create_session(db: AsyncSession, title: str, created_by: str) -> Session:
    session = Session(
        title=title,
        invite_token=generate_invite_token(),
        created_by=created_by,
        status=SessionStatus.waiting,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    sessions_created_counter.inc()
    return session


async def get_session_by_id(db: AsyncSession, session_id: str) -> Session | None:
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.participants))
    )
    return result.scalar_one_or_none()


async def get_session_by_invite_token(db: AsyncSession, token: str) -> Session | None:
    result = await db.execute(select(Session).where(Session.invite_token == token))
    return result.scalar_one_or_none()


async def get_sessions_by_agent(db: AsyncSession, agent_id: str) -> list[Session]:
    result = await db.execute(
        select(Session)
        .where(Session.created_by == agent_id)
        .order_by(Session.created_at.desc())
    )
    return list(result.scalars().all())


async def end_session(db: AsyncSession, session: Session, actor_name: str) -> Session:
    now = datetime.utcnow()
    session.status = SessionStatus.ended
    session.ended_at = now
    if session.started_at:
        session.duration_seconds = int((now - session.started_at).total_seconds())
    # Mark all active participants as left
    for p in session.participants:
        if p.left_at is None:
            p.left_at = now
    event = SessionEvent(
        session_id=session.id,
        event_type="session_ended",
        actor_name=actor_name,
    )
    db.add(event)
    await db.flush()
    sessions_ended_counter.inc()
    active_sessions_gauge.dec()
    return session


async def log_event(
    db: AsyncSession,
    session_id: str,
    event_type: str,
    actor_name: str,
    metadata: dict | None = None,
):
    event = SessionEvent(
        session_id=session_id,
        event_type=event_type,
        actor_name=actor_name,
        metadata=metadata,
    )
    db.add(event)
    await db.flush()


async def get_session_events(db: AsyncSession, session_id: str) -> list[SessionEvent]:
    result = await db.execute(
        select(SessionEvent)
        .where(SessionEvent.session_id == session_id)
        .order_by(SessionEvent.occurred_at.asc())
    )
    return list(result.scalars().all())
