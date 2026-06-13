from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.database import get_db
from models.models import User, Recording
from schemas.schemas import RecordingOut
from services.session_service import get_session_by_id
from services.recording_service import (
    start_recording, stop_recording, get_recordings_for_session
)
from services.storage_service import get_presigned_url
from api.deps import get_current_user, require_agent

router = APIRouter(tags=["recordings"])


@router.post("/api/sessions/{session_id}/recordings/start", response_model=RecordingOut)
async def start(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    recording = await start_recording(db, session_id)
    return recording


@router.post("/api/recordings/{recording_id}/stop", response_model=RecordingOut)
async def stop(
    recording_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    recording = await stop_recording(db, recording_id)
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    return recording


@router.get("/api/sessions/{session_id}/recordings", response_model=list[RecordingOut])
async def list_recordings(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_recordings_for_session(db, session_id)


@router.get("/api/recordings/{recording_id}/status", response_model=RecordingOut)
async def get_status(
    recording_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Recording).where(Recording.id == recording_id))
    recording = result.scalar_one_or_none()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    return recording


@router.get("/api/recordings/{recording_id}/download")
async def download(
    recording_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Recording).where(Recording.id == recording_id))
    recording = result.scalar_one_or_none()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    if not recording.file_path:
        raise HTTPException(status_code=425, detail="Recording not ready yet")
    url = get_presigned_url(recording.file_path, expiry_seconds=3600)
    return {"download_url": url}
