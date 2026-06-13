from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from db.database import get_db
from models.models import User, Session, SessionStatus, Participant
from schemas.schemas import SessionDetailOut, SessionOut
from services.session_service import end_session
from api.deps import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/sessions/live", response_model=list[SessionDetailOut])
async def live_sessions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(Session)
        .where(Session.status.in_([SessionStatus.active, SessionStatus.waiting]))
        .options(selectinload(Session.participants))
        .order_by(Session.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/sessions", response_model=list[SessionDetailOut])
async def all_sessions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(Session)
        .options(selectinload(Session.participants))
        .order_by(Session.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/sessions/{session_id}")
async def force_end_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.participants))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == SessionStatus.ended:
        raise HTTPException(status_code=400, detail="Session already ended")
    await end_session(db, session, actor_name=f"admin:{current_user.email}")
    return {"detail": "Session ended by admin"}


@router.get("/metrics")
async def admin_metrics(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    total = await db.execute(select(func.count(Session.id)))
    active = await db.execute(select(func.count(Session.id)).where(Session.status == SessionStatus.active))
    ended = await db.execute(select(func.count(Session.id)).where(Session.status == SessionStatus.ended))
    participants = await db.execute(select(func.count(Participant.id)))
    return {
        "total_sessions": total.scalar(),
        "active_sessions": active.scalar(),
        "ended_sessions": ended.scalar(),
        "total_participants": participants.scalar(),
    }
