import os
import io
import uuid
import boto3
from botocore.exceptions import ClientError
from typing import BinaryIO, Union
from app.core.config import settings

class StorageService:
    """
    Abstracts file storage operations so Ciphera can seamlessly switch 
    between local disk (Docker volumes) and Cloud Object Storage (AWS S3/MinIO).
    """

    @classmethod
    def get_client(cls):
        if settings.STORAGE_BACKEND == "s3":
            # boto3 automatically picks up AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from env
            kwargs = {"region_name": settings.S3_REGION}
            if settings.S3_ENDPOINT_URL:
                kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
            return boto3.client("s3", **kwargs)
        return None

    @classmethod
    def save_document(cls, file_obj: Union[BinaryIO, bytes], original_filename: str, directory: str = "documents") -> str:
        """
        Saves a document and returns a unique storage_key.
        """
        extension = os.path.splitext(original_filename)[1]
        unique_id = str(uuid.uuid4())
        storage_key = f"{directory}/{unique_id}{extension}"
        
        # Ensure we have bytes
        if isinstance(file_obj, bytes):
            file_data = file_obj
        else:
            file_data = file_obj.read()
            
        if settings.STORAGE_BACKEND == "s3":
            s3 = cls.get_client()
            s3.put_object(
                Bucket=settings.S3_BUCKET,
                Key=storage_key,
                Body=file_data
            )
        else:
            # Local Storage
            file_path = os.path.join(settings.LOCAL_STORAGE_DIR, storage_key)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(file_data)
                
        return storage_key

    @classmethod
    def get_document(cls, storage_key: str) -> bytes:
        """
        Retrieves a document's bytes using its storage_key.
        """
        if settings.STORAGE_BACKEND == "s3":
            s3 = cls.get_client()
            response = s3.get_object(Bucket=settings.S3_BUCKET, Key=storage_key)
            return response['Body'].read()
        else:
            file_path = os.path.join(settings.LOCAL_STORAGE_DIR, storage_key)
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Storage key not found: {storage_key}")
            with open(file_path, "rb") as f:
                return f.read()

    @classmethod
    def delete_document(cls, storage_key: str) -> bool:
        """
        Deletes a document from storage.
        """
        if settings.STORAGE_BACKEND == "s3":
            s3 = cls.get_client()
            s3.delete_object(Bucket=settings.S3_BUCKET, Key=storage_key)
            return True
        else:
            file_path = os.path.join(settings.LOCAL_STORAGE_DIR, storage_key)
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False

    @classmethod
    def generate_presigned_url(cls, storage_key: str, expiration: int = 3600) -> str:
        """
        Generates a secure temporary download URL. 
        For local storage, returns a relative API route that will stream the file.
        """
        if settings.STORAGE_BACKEND == "s3":
            s3 = cls.get_client()
            url = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': settings.S3_BUCKET, 'Key': storage_key},
                ExpiresIn=expiration
            )
            return url
        else:
            # For local dev, we rely on the FastAPI backend to stream it via a specific endpoint
            # E.g., /api/v3/documents/download?key=...
            return f"/api/v3/documents/download?key={storage_key}"
