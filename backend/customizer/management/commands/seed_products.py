"""
Management command to seed the database with sample products.
Run: python manage.py seed_products
"""
import os
import urllib.request
import shutil
from django.core.management.base import BaseCommand
from django.core.files import File
from django.conf import settings
from customizer.models import Product


SAMPLE_PRODUCTS = [
    {
        'name': 'Coffee Mug',
        'slug': 'coffee-mug',
        'description': 'Classic white ceramic coffee mug — perfect for your morning brew.',
        'box_x_percent': 28.0,
        'box_y_percent': 22.0,
        'box_w_percent': 44.0,
        'box_h_percent': 42.0,
        # Unsplash free images
        'image_url': 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=700&q=80',
    },
    {
        'name': 'Handbag',
        'slug': 'handbag',
        'description': 'Elegant tote bag with a spacious customization panel.',
        'box_x_percent': 30.0,
        'box_y_percent': 30.0,
        'box_w_percent': 40.0,
        'box_h_percent': 35.0,
        'image_url': 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=700&q=80',
    },
    {
        'name': 'Water Bottle',
        'slug': 'water-bottle',
        'description': 'Stainless steel insulated water bottle with wrap-around design area.',
        'box_x_percent': 32.0,
        'box_y_percent': 20.0,
        'box_w_percent': 36.0,
        'box_h_percent': 55.0,
        'image_url': 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=700&q=80',
    },
    {
        'name': 'T-Shirt',
        'slug': 't-shirt',
        'description': 'Premium cotton crew-neck t-shirt with a chest print area.',
        'box_x_percent': 30.0,
        'box_y_percent': 18.0,
        'box_w_percent': 40.0,
        'box_h_percent': 30.0,
        'image_url': 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=700&q=80',
    },
    {
        'name': 'Notebook',
        'slug': 'notebook',
        'description': 'Hardcover A5 notebook with a full-cover custom design area.',
        'box_x_percent': 10.0,
        'box_y_percent': 10.0,
        'box_w_percent': 80.0,
        'box_h_percent': 80.0,
        'image_url': 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=700&q=80',
    },
    {
        'name': 'Phone Case',
        'slug': 'phone-case',
        'description': 'Slim transparent phone case with a full-back design area.',
        'box_x_percent': 12.0,
        'box_y_percent': 10.0,
        'box_w_percent': 76.0,
        'box_h_percent': 80.0,
        'image_url': 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=700&q=80',
    },
]


class Command(BaseCommand):
    help = 'Seed the database with sample products'

    def handle(self, *args, **options):
        media_products = os.path.join(settings.MEDIA_ROOT, 'products')
        os.makedirs(media_products, exist_ok=True)

        for data in SAMPLE_PRODUCTS:
            if Product.objects.filter(slug=data['slug']).exists():
                self.stdout.write(f"  SKIP  {data['name']} (already exists)")
                continue

            # Download image
            filename = f"{data['slug']}.jpg"
            dest_path = os.path.join(media_products, filename)

            try:
                self.stdout.write(f"  Downloading image for {data['name']}…")
                headers = {'User-Agent': 'Mozilla/5.0'}
                req = urllib.request.Request(data['image_url'], headers=headers)
                with urllib.request.urlopen(req, timeout=15) as resp, open(dest_path, 'wb') as out:
                    shutil.copyfileobj(resp, out)
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"  Could not download image: {e}. Skipping image."))
                dest_path = None

            product = Product(
                name=data['name'],
                slug=data['slug'],
                description=data['description'],
                box_x_percent=data['box_x_percent'],
                box_y_percent=data['box_y_percent'],
                box_w_percent=data['box_w_percent'],
                box_h_percent=data['box_h_percent'],
            )

            if dest_path and os.path.exists(dest_path):
                with open(dest_path, 'rb') as f:
                    product.image.save(filename, File(f), save=False)

            product.save()
            self.stdout.write(self.style.SUCCESS(f"  ✓ Created {data['name']}"))

        self.stdout.write(self.style.SUCCESS('\nDone! All sample products seeded.'))
