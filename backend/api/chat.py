from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.database import get_db
from models.models import ChatMessage
from schemas.schemas import ChatMessageOut
from services.session_service import get_session_by_id
from api.deps import get_current_user
from models.models import User

router = APIRouter(prefix="/api/sessions", tags=["chat"])


@router.get("/{session_id}/chat", response_model=list[ChatMessageOut])
async def get_chat_history(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return list(result.scalars().all())
