import os
import requests
import json
import time
import logging
from django.conf import settings

# Set up logging
logger = logging.getLogger(__name__)

# Usually API keys are in settings or env
TRIPO_API_KEY = getattr(settings, 'TRIPO_API_KEY', os.environ.get('TRIPO_API_KEY', ''))

def retry_on_failure(max_retries=3, delay=1, backoff=2):
    """
    Decorator to retry functions on failure with exponential backoff.
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            retries = 0
            current_delay = delay
            last_exception = None
            
            while retries < max_retries:
                try:
                    return func(*args, **kwargs)
                except (requests.exceptions.RequestException, requests.exceptions.Timeout) as e:
                    last_exception = e
                    retries += 1
                    if retries < max_retries:
                        logger.warning(f"Retry {retries}/{max_retries} for {func.__name__} after {current_delay}s: {str(e)}")
                        time.sleep(current_delay)
                        current_delay *= backoff
                    else:
                        logger.error(f"Max retries ({max_retries}) exceeded for {func.__name__}")
                except Exception as e:
                    # Don't retry on non-network errors
                    raise e
            
            raise last_exception
        return wrapper
    return decorator

class TripoService:
    BASE_URL = "https://openapi.tripo3d.ai/v3"
    
    @classmethod
    def get_headers(cls):
        # Log partial API key for debugging (show first 8 and last 4 chars)
        masked_key = f"{TRIPO_API_KEY[:8]}...{TRIPO_API_KEY[-4:]}" if len(TRIPO_API_KEY) > 12 else "***"
        print(f"DEBUG: Using API key: {masked_key}")
        return {
            "Authorization": f"Bearer {TRIPO_API_KEY}",
            "Content-Type": "application/json"
        }

    @classmethod
    def check_balance(cls):
        """
        Check the API key's credit balance using v3 endpoint.
        Returns dict with balance information.
        """
        try:
            # Use v3 endpoint for balance check
            url = "https://openapi.tripo3d.ai/v3/account/balance"
            response = requests.get(url, headers=cls.get_headers())
            response.raise_for_status()
            data = response.json()
            
            print(f"DEBUG: Balance check response: {data}")
            return data
        except Exception as e:
            print(f"DEBUG: Error checking balance: {e}")
            raise

    @classmethod
    @retry_on_failure(max_retries=3, delay=1, backoff=2)
    def upload_file(cls, file_path):
        """
        Helper to upload a local file to Tripo to get a file_token if needed.
        """
        url = f"{cls.BASE_URL}/files"
        headers = {"Authorization": f"Bearer {TRIPO_API_KEY}"}
        
        logger.info(f"Uploading file to Tripo: {file_path}")
        with open(file_path, 'rb') as f:
            files = {'file': f}
            response = requests.post(url, headers=headers, files=files, timeout=30)
            logger.info(f"Upload response status: {response.status_code}")
            logger.debug(f"Upload response body: {response.text}")
            response.raise_for_status()
            data = response.json()
            logger.debug(f"Upload response data: {data}")
            if data.get("code") == 0:
                return data["data"].get("file_token", data["data"].get("image_token"))
            raise Exception(f"Tripo file upload failed: {data}")

    @classmethod
    @retry_on_failure(max_retries=3, delay=2, backoff=2)
    def generate_from_local_file(cls, file_path, model_version="v3.1-20260211", texture_quality="standard", **kwargs):
        """
        Step 1: Upload a local file and start a 3D generation task.
        """
        logger.info(f"TRIPO_API_KEY configured: {bool(TRIPO_API_KEY)}")
        if not TRIPO_API_KEY:
            raise ValueError("Tripo API key is not configured in settings or environment.")
        
        # Check balance before attempting generation
        try:
            balance_info = cls.check_balance()
            available_balance = balance_info.get('balance', 0)
            frozen_balance = balance_info.get('frozen', 0)
            logger.info(f"Available balance: {available_balance}, Frozen: {frozen_balance}")
            if available_balance < 30:
                logger.warning(f"Low balance warning: {available_balance} credits remaining")
        except Exception as e:
            logger.warning(f"Could not check balance, proceeding anyway: {e}")

        file_token = cls.upload_file(file_path)
        
        # Detect file type from extension
        import os
        file_ext = os.path.splitext(file_path)[1].lower().lstrip('.')
        file_type = file_ext if file_ext in ['jpg', 'jpeg', 'png', 'webp'] else 'jpg'
        
        # V3 API structure for image-to-model using nested file structure
        payload = {
            "file": {
                "type": file_type,
                "file_token": file_token
            },
            "model": model_version,
            "texture": True,
            "texture_quality": texture_quality,
            **kwargs  # Allow additional parameters like face_limit, etc.
        }
        logger.info(f"Sending payload to Tripo API (from local file): {payload}")
        logger.debug(f"Headers: {cls.get_headers()}")
        response = requests.post(f"{cls.BASE_URL}/generation/image-to-model", headers=cls.get_headers(), json=payload, timeout=30)
        logger.info(f"Response status: {response.status_code}")
        logger.debug(f"Response body: {response.text}")
        response.raise_for_status()
        data = response.json()
        
        if data.get("code") == 0 and "data" in data and "task_id" in data["data"]:
            task_id = data["data"]["task_id"]
            logger.info(f"Successfully started Tripo task: {task_id}")
            return task_id
        
        raise Exception(f"Failed to start Tripo task: {data}")

    @classmethod
    @retry_on_failure(max_retries=3, delay=2, backoff=2)
    def generate_from_image(cls, image_url: str, model_version="v3.1-20260211", texture_quality="standard", **kwargs):
        """
        Step 1: Start a 3D generation task using a public image URL.
        """
        if not TRIPO_API_KEY:
            raise ValueError("Tripo API key is not configured in settings or environment.")

        # V3 API structure for image-to-model with URL (corrected based on official docs)
        payload = {
            "input": image_url,
            "model": model_version,
            "texture": True,
            "texture_quality": texture_quality,
            **kwargs  # Allow additional parameters like face_limit, etc.
        }
        logger.info(f"Sending payload to Tripo API (from URL): {payload}")
        logger.debug(f"Headers: {cls.get_headers()}")
        response = requests.post(f"{cls.BASE_URL}/generation/image-to-model", headers=cls.get_headers(), json=payload, timeout=30)
        logger.info(f"Response status: {response.status_code}")
        logger.debug(f"Response body: {response.text}")
        response.raise_for_status()
        data = response.json()
        
        if data.get("code") == 0 and "data" in data and "task_id" in data["data"]:
            task_id = data["data"]["task_id"]
            logger.info(f"Successfully started Tripo task: {task_id}")
            return task_id
        
        raise Exception(f"Failed to start Tripo task: {data}")

    @classmethod
    @retry_on_failure(max_retries=3, delay=1, backoff=2)
    def get_task_status(cls, task_id: str):
        """
        Step 2: Check the status of a task.
        Returns a dict: {'status': 'running' | 'success' | 'failed', 'model_url': '...', 'progress': 100}
        """
        response = requests.get(f"{cls.BASE_URL}/tasks/{task_id}", headers=cls.get_headers(), timeout=15)
        response.raise_for_status()
        data = response.json()
        
        if data.get("code") == 0:
            task_data = data["data"]
            status = task_data.get("status")
            progress = task_data.get("progress", 0)
            
            result = {
                "status": status,
                "progress": progress,
                "model_url": None,
                "rendered_image_url": None
            }
            
            if status == "success":
                # Get the GLB model url from output
                output = task_data.get("output", {})
                result["model_url"] = output.get("model_url")
                result["rendered_image_url"] = output.get("rendered_image_url")
                logger.info(f"Task {task_id} completed successfully, model URL available")
                
            return result
            
        raise Exception(f"Failed to check Tripo task status: {data}")

    @classmethod
    def wait_for_completion(cls, task_id: str, timeout: int = 300, poll_interval: int = 2):
        """
        Wait for task completion with timeout.
        Returns final result dict or raises exception on timeout/failure.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            result = cls.get_task_status(task_id)
            status = result.get("status")
            
            if status == "success":
                logger.info(f"Tripo task {task_id} completed successfully")
                return result
            elif status in ("failed", "cancelled", "banned"):
                error_msg = f"Tripo task {task_id} failed with status: {status}"
                logger.error(error_msg)
                raise Exception(error_msg)
            
            time.sleep(poll_interval)
        
        timeout_msg = f"Tripo task {task_id} timed out after {timeout} seconds"
        logger.error(timeout_msg)
        raise Exception(timeout_msg)
