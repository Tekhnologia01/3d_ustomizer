import time
import requests
from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from customizer.models import Product
from customizer.services.tripo import TripoService

class Command(BaseCommand):
    help = 'Polls the Tripo API for pending 3D generation jobs and downloads completed models'

    def handle(self, *args, **options):
        self.stdout.write('Starting Tripo job polling...')
        
        pending_products = Product.objects.filter(tripo_status='pending').exclude(tripo_job_id__isnull=True)
        
        if not pending_products.exists():
            self.stdout.write('No pending Tripo jobs found.')
            return

        for product in pending_products:
            self.stdout.write(f"Checking job {product.tripo_job_id} for product {product.id}...")
            try:
                result = TripoService.get_task_status(product.tripo_job_id)
                status = result['status']
                
                if status == 'success' and result.get('model_url'):
                    self.stdout.write(self.style.SUCCESS(f"Job {product.tripo_job_id} completed! Downloading model..."))
                    
                    # Download the GLB file
                    model_response = requests.get(result['model_url'])
                    model_response.raise_for_status()
                    
                    # Save to the product's model_3d field
                    filename = f"product_{product.id}_model.glb"
                    product.model_3d.save(filename, ContentFile(model_response.content))
                    
                    product.tripo_status = 'completed'
                    product.tripo_model_url = result['model_url']
                    product.save()
                    
                    self.stdout.write(self.style.SUCCESS(f"Successfully saved 3D model for product {product.id}."))
                    
                elif status in ['failed', 'error', 'timeout', 'cancelled']:
                    self.stdout.write(self.style.ERROR(f"Job {product.tripo_job_id} failed with status: {status}"))
                    product.tripo_status = status
                    product.save()
                else:
                    self.stdout.write(f"Job {product.tripo_job_id} still running (progress: {result.get('progress')}%)")
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error checking job {product.tripo_job_id}: {str(e)}"))
                
        self.stdout.write('Polling finished.')
