import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from db.database import get_db
from models.models import User, ChatMessage, MessageType
from services.session_service import get_session_by_id
from services.storage_service import upload_file, get_presigned_url
from api.deps import get_current_user
from observability.metrics import files_uploaded_counter

router = APIRouter(tags=["files"])

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf", "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/api/sessions/{session_id}/files")
async def upload_chat_file(
    session_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{file.content_type}' not allowed")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    object_key = f"files/{session_id}/{uuid.uuid4()}.{ext}"
    upload_file(file_bytes, object_key, file.content_type)
    download_url = get_presigned_url(object_key, expiry_seconds=86400)

    msg = ChatMessage(
        session_id=session_id,
        sender_name=current_user.full_name,
        sender_role=current_user.role,
        file_url=download_url,
        file_name=file.filename,
        message_type=MessageType.file,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    files_uploaded_counter.inc()

    return {
        "message_id": msg.id,
        "file_name": file.filename,
        "file_url": download_url,
        "object_key": object_key,
    }
