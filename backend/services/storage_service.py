# import boto3
# from botocore.client import Config
# from botocore.exceptions import ClientError
# from config import settings
# import structlog

# log = structlog.get_logger()

# s3_client = boto3.client(
#     "s3",
#     endpoint_url=f"http://{settings.MINIO_ENDPOINT}",
#     aws_access_key_id=settings.MINIO_ACCESS_KEY,
#     aws_secret_access_key=settings.MINIO_SECRET_KEY,
#     config=Config(signature_version="s3v4"),
#     region_name="us-east-1",
# )


# def ensure_bucket():
#     try:
#         s3_client.head_bucket(Bucket=settings.MINIO_BUCKET)
#     except ClientError:
#         s3_client.create_bucket(Bucket=settings.MINIO_BUCKET)
#         log.info("Created MinIO bucket", bucket=settings.MINIO_BUCKET)


# def upload_file(file_bytes: bytes, object_key: str, content_type: str = "application/octet-stream") -> str:
#     s3_client.put_object(
#         Bucket=settings.MINIO_BUCKET,
#         Key=object_key,
#         Body=file_bytes,
#         ContentType=content_type,
#     )
#     return object_key


# def upload_file_from_path(file_path: str, object_key: str) -> str:
#     s3_client.upload_file(file_path, settings.MINIO_BUCKET, object_key)
#     return object_key


# def get_presigned_url(object_key: str, expiry_seconds: int = 3600) -> str:
#     return s3_client.generate_presigned_url(
#         "get_object",
#         Params={"Bucket": settings.MINIO_BUCKET, "Key": object_key},
#         ExpiresIn=expiry_seconds,
#     )


# def get_object_size(object_key: str) -> int:
#     try:
#         response = s3_client.head_object(Bucket=settings.MINIO_BUCKET, Key=object_key)
#         return response["ContentLength"]
#     except ClientError:
#         return 0

from supabase import create_client
from config import settings
import uuid

supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
BUCKET = "atomquest"


def ensure_bucket():
    pass  # Bucket created manually in Supabase dashboard


def upload_file(file_bytes: bytes, filename: str, content_type: str) -> str:
    path = f"uploads/{uuid.uuid4()}_{filename}"
    supabase.storage.from_(BUCKET).upload(path, file_bytes, {"content-type": content_type})
    return path


def get_presigned_url(path: str, expiry_seconds: int = 3600) -> str:
    res = supabase.storage.from_(BUCKET).create_signed_url(path, expiry_seconds)
    return res["signedURL"]


def upload_file_from_path(local_path: str, dest_path: str) -> str:
    with open(local_path, "rb") as f:
        data = f.read()
    supabase.storage.from_(BUCKET).upload(dest_path, data)
    return dest_path


def get_object_size(path: str) -> int:
    return 0