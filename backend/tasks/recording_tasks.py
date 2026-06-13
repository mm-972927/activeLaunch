from celery import Celery
from config import settings
import subprocess
import os
import tempfile

celery_app = Celery("atomquest", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"


@celery_app.task(bind=True, max_retries=3)
def process_recording(self, recording_id: str):
    """
    Convert raw WebM/Matroska from GStreamer to MP4, upload to MinIO,
    update recording status in DB via sync SQLAlchemy.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from models.models import Recording, RecordingStatus
    from services.storage_service import upload_file_from_path, get_presigned_url, get_object_size
    from datetime import datetime
    import structlog

    log = structlog.get_logger()

    # Use sync engine for Celery (not async)
    sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url)
    Session = sessionmaker(engine)

    with Session() as db:
        recording = db.query(Recording).filter(Recording.id == recording_id).first()
        if not recording:
            log.error("Recording not found", recording_id=recording_id)
            return

        raw_path = f"/tmp/recordings/{recording_id}.webm"
        mp4_path = f"/tmp/recordings/{recording_id}.mp4"

        if not os.path.exists(raw_path):
            log.error("Raw recording file not found", path=raw_path)
            recording.status = RecordingStatus.failed
            db.commit()
            return

        try:
            # Convert WebM → MP4 using FFmpeg
            result = subprocess.run(
                ["ffmpeg", "-i", raw_path, "-c:v", "libx264", "-c:a", "aac",
                 "-movflags", "+faststart", "-y", mp4_path],
                capture_output=True, timeout=300
            )
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg failed: {result.stderr.decode()}")

            object_key = f"recordings/{recording_id}.mp4"
            upload_file_from_path(mp4_path, object_key)
            download_url = get_presigned_url(object_key, expiry_seconds=604800)  # 7 days
            file_size = get_object_size(object_key)

            recording.status = RecordingStatus.ready
            recording.file_path = object_key
            recording.download_url = download_url
            recording.file_size_bytes = file_size
            recording.completed_at = datetime.utcnow()
            db.commit()

            # Cleanup temp files
            os.remove(raw_path)
            os.remove(mp4_path)
            log.info("Recording processed successfully", recording_id=recording_id)

        except Exception as exc:
            log.error("Recording processing failed", recording_id=recording_id, error=str(exc))
            recording.status = RecordingStatus.failed
            db.commit()
            raise self.retry(exc=exc, countdown=30)
