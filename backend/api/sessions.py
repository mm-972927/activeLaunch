from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from db.database import get_db
from models.models import User, SessionStatus
from schemas.schemas import CreateSessionRequest, SessionOut, SessionDetailOut, SessionEventOut
from services.session_service import (
    create_session, get_session_by_id, get_sessions_by_agent,
    end_session, get_session_events, get_session_by_invite_token
)
from api.deps import get_current_user, require_agent
from config import settings

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut, status_code=201)
async def create(
    payload: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    session = await create_session(db, payload.title, current_user.id)
    return session


@router.get("", response_model=list[SessionOut])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    return await get_sessions_by_agent(db, current_user.id)


@router.get("/{session_id}", response_model=SessionDetailOut)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{session_id}/end", response_model=SessionOut)
async def end(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can only end your own sessions")
    if session.status == SessionStatus.ended:
        raise HTTPException(status_code=400, detail="Session already ended")
    session = await end_session(db, session, current_user.full_name)
    return session


@router.get("/{session_id}/join")
async def validate_invite(
    session_id: str,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Validate an invite token before a customer joins. Returns session title."""
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.invite_token != token:
        raise HTTPException(status_code=403, detail="Invalid invite token")
    if session.status == SessionStatus.ended:
        raise HTTPException(status_code=410, detail="This session has ended")
    return {
        "session_id": session.id,
        "title": session.title,
        "status": session.status,
        "invite_link": f"{settings.FRONTEND_URL}/join/{session.id}?token={token}",
    }


@router.get("/{session_id}/history", response_model=list[SessionEventOut])
async def history(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return await get_session_events(db, session_id)
