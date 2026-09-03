#!/usr/bin/env python
"""
Script to retrieve a 3D model from Tripo using a task_id
and save it to a product in the database.
"""
import os
import sys
import django
import requests

# Setup Django
sys.path.insert(0, r'C:\Users\Saurabh Pansare\Desktop\3D\3D Logo on product')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from customizer.services.tripo import TripoService
from customizer.models import Product
from django.core.files import File
import tempfile

def retrieve_and_save_model(task_id, product_id=None):
    """
    Retrieve a 3D model from Tripo using task_id and save it to a product.
    
    Args:
        task_id: The Tripo task ID
        product_id: Optional product ID to associate the model with
    """
    print(f"Checking status for task_id: {task_id}")
    
    try:
        # Check task status
        result = TripoService.get_task_status(task_id)
        status = result.get('status')
        print(f"Task status: {status}")
        
        if status == 'success':
            print("SUCCESS: Task completed successfully!")
            
            model_url = result.get('model_url')
            rendered_image_url = result.get('rendered_image_url')
            
            print(f"Model URL: {model_url}")
            print(f"Preview Image URL: {rendered_image_url}")
            
            # Download the model
            print("Downloading 3D model...")
            model_response = requests.get(model_url, timeout=30)
            model_response.raise_for_status()
            
            # Save to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.glb') as temp_file:
                temp_file.write(model_response.content)
                model_temp_path = temp_file.name
            
            print(f"Downloaded model size: {len(model_response.content)} bytes")
            
            # If product_id provided, save to database
            if product_id:
                try:
                    product = Product.objects.get(pk=product_id)
                    print(f"Found product: {product.name}")
                    
                    # Save model to product
                    with open(model_temp_path, 'rb') as f:
                        product.model_3d.save(
                            f'{product.name.replace(" ", "_")}_3d.glb', 
                            File(f), 
                            save=True
                        )
                    
                    # Update Tripo fields
                    product.tripo_job_id = task_id
                    product.tripo_status = 'success'
                    product.tripo_model_url = model_url
                    product.save()
                    
                    print(f"SUCCESS: Model saved to product {product.name}")
                    print(f"  Model file: {product.model_3d.name}")
                    print(f"  Model URL: {product.model_3d.url}")
                    
                    # Download and save preview image if available
                    if rendered_image_url:
                        try:
                            print("Downloading preview image...")
                            image_response = requests.get(rendered_image_url, timeout=30)
                            image_response.raise_for_status()
                            
                            from urllib.parse import urlparse
                            parsed_url = urlparse(rendered_image_url)
                            ext = os.path.splitext(parsed_url.path)[1] or '.png'
                            
                            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_image:
                                temp_image.write(image_response.content)
                                image_temp_path = temp_image.name
                            
                            try:
                                with open(image_temp_path, 'rb') as img_f:
                                    product.image.save(
                                        f'{product.name.replace(" ", "_")}_preview{ext}', 
                                        File(img_f), 
                                        save=True
                                    )
                                print(f"SUCCESS: Preview image saved: {product.image.url}")
                            finally:
                                if os.path.exists(image_temp_path):
                                    os.unlink(image_temp_path)
                        except Exception as e:
                            print(f"Warning: Could not download preview image: {e}")
                    
                except Product.DoesNotExist:
                    print(f"Error: Product with ID {product_id} not found")
                except Exception as e:
                    print(f"Error saving to database: {e}")
            else:
                # Just save to local file if no product_id
                local_filename = f"tripo_model_{task_id}.glb"
                with open(local_filename, 'wb') as f:
                    f.write(model_response.content)
                print(f"SUCCESS: Model saved to local file: {local_filename}")
            
            # Cleanup temp file
            if os.path.exists(model_temp_path):
                os.unlink(model_temp_path)
                
        elif status in ['failed', 'cancelled', 'banned']:
            print(f"ERROR: Task failed with status: {status}")
        else:
            print(f"Task still in progress: {status}")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python retrieve_tripo_model.py <task_id> [product_id]")
        print("Example: python retrieve_tripo_model.py abc123task 25")
        sys.exit(1)
    
    task_id = sys.argv[1]
    product_id = int(sys.argv[2]) if len(sys.argv) > 2 else None
    
    retrieve_and_save_model(task_id, product_id)