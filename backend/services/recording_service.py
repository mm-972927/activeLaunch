import httpx
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.models import Recording, RecordingStatus, Session
from services.storage_service import upload_file_from_path, get_presigned_url, get_object_size
from config import settings
from observability.metrics import recordings_started_counter
import structlog

log = structlog.get_logger()


async def start_recording(db: AsyncSession, session_id: str) -> Recording:
    recording = Recording(session_id=session_id, status=RecordingStatus.recording)
    db.add(recording)
    await db.flush()
    await db.refresh(recording)

    # Tell mediasoup to start piping to GStreamer
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{settings.MEDIA_SERVER_URL}/recording/start",
            json={"session_id": session_id, "recording_id": recording.id},
            timeout=10,
        )

    recordings_started_counter.inc()
    log.info("Recording started", session_id=session_id, recording_id=recording.id)
    return recording


async def stop_recording(db: AsyncSession, recording_id: str) -> Recording:
    result = await db.execute(select(Recording).where(Recording.id == recording_id))
    recording = result.scalar_one_or_none()
    if not recording:
        return None

    recording.status = RecordingStatus.processing

    # Tell mediasoup to stop piping
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{settings.MEDIA_SERVER_URL}/recording/stop",
            json={"recording_id": recording_id},
            timeout=10,
        )

    # Queue Celery task
    from tasks.recording_tasks import process_recording
    process_recording.delay(recording_id)

    log.info("Recording stopped, processing queued", recording_id=recording_id)
    return recording


async def get_recordings_for_session(db: AsyncSession, session_id: str) -> list[Recording]:
    result = await db.execute(select(Recording).where(Recording.session_id == session_id))
    return list(result.scalars().all())
