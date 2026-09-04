# import json
# import time
# from django.shortcuts import render, get_object_or_404
# from django.http import JsonResponse
# from django.views.decorators.http import require_GET, require_POST
# from django.views.decorators.csrf import csrf_exempt
# from django.utils.text import slugify
# from .models import Product, DesignZone, Client, DesignSubmission
# import requests
# from django.conf import settings

# # ─────────────────────────────────────────────────────────────────────────────
# #  PAGE 1 — Product Gallery (Home)
# # ─────────────────────────────────────────────────────────────────────────────
# def gallery(request):
#     products_qs = Product.objects.filter(is_active=True)
#     products = [{'id': p.id, 'name': p.name, 'image_url': p.get_image_url} for p in products_qs]
#     return render(request, 'customizer/gallery.html', {'products_json': json.dumps(products)})


# # ─────────────────────────────────────────────────────────────────────────────
# #  PAGE 2 — Setup Page (admin defines logo/text zones)
# # ─────────────────────────────────────────────────────────────────────────────
# def setup(request):
#     """Page where admin visually defines logo and text zones on a product."""
#     products_qs = Product.objects.filter(is_active=True)
#     products = [{
#         'id': p.id,
#         'name': p.name,
#         'shape_type': p.shape_type,
#         'image_url': p.get_image_url,
#         'back_image_url': p.get_back_image_url,
#         'left_image_url': p.get_left_image_url,
#         'right_image_url': p.get_right_image_url,
#         'top_image_url': p.get_top_image_url,
#         'model_3d_url': p.model_3d.url if p.model_3d else None,
#     } for p in products_qs]
#     return render(request, 'customizer/setup.html', {'products_json': json.dumps(products)})


# @csrf_exempt
# @require_POST
# def save_zones(request):
#     """API: Receive zone data from setup page and save to DB."""
#     try:
#         data = json.loads(request.body)
#         product_id = data.get('product_id')
#         zones = data.get('zones', [])

#         product = get_object_or_404(Product, pk=product_id)
#         # Clear existing zones and replace
#         product.zones.all().delete()
#         for z in zones:
#             DesignZone.objects.create(
#                 product=product,
#                 name=z.get('name', ''),
#                 side=z.get('side', 'front'),
#                 zone_type=z['zone_type'],
#                 x_percent=z['x_percent'],
#                 y_percent=z['y_percent'],
#                 width_percent=z['width_percent'],
#                 height_percent=z['height_percent'],
#                 angle=z.get('angle', 0.0),
#                 actual_width=z.get('actual_width', 12.0),
#                 actual_height=z.get('actual_height', 12.0),
#                 source=z.get('source', '2d'),
#                 point3d=z.get('point3d'),
#                 normal3d=z.get('normal3d'),
#                 size3d=z.get('size3d'),
#             )
#         return JsonResponse({'success': True, 'count': len(zones)})
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=400)


# @require_GET
# def get_zones(request, pk):
#     """API: Return product info + its design zones, side images, and shape type."""
#     product = get_object_or_404(Product, pk=pk)
#     zones = list(product.zones.values('id', 'name', 'side', 'zone_type', 'x_percent', 'y_percent', 'width_percent', 'height_percent', 'angle', 'actual_width', 'actual_height', 'source', 'point3d', 'normal3d', 'size3d'))
#     return JsonResponse({
#         'id': product.id,
#         'name': product.name,
#         'shape_type': product.shape_type,
#         'image_url': product.get_image_url,
#         'back_image_url': product.get_back_image_url,
#         'left_image_url': product.get_left_image_url,
#         'right_image_url': product.get_right_image_url,
#         'top_image_url': product.get_top_image_url,
#         'model_3d_url': product.model_3d.url if product.model_3d else None,
#         'zones': zones,
#     })


# # ─────────────────────────────────────────────────────────────────────────────
# #  PAGE 3 — Customize Page (user uploads logo / types text)
# # ─────────────────────────────────────────────────────────────────────────────
# def customize(request, pk):
#     product = get_object_or_404(Product, pk=pk, is_active=True)
#     zones = list(product.zones.values('id', 'name', 'side', 'zone_type', 'x_percent', 'y_percent', 'width_percent', 'height_percent', 'angle', 'actual_width', 'actual_height', 'source', 'point3d', 'normal3d', 'size3d'))
    
#     def get_imprint_methods(p):
#         methods = list(p.available_imprint_methods.all())
#         if not methods and p.material:
#             methods = list(p.material.compatible_methods.all())
#         return [{'id': m.id, 'name': m.name, 'visual_effect': m.visual_effect, 'supports_color': m.supports_color} for m in methods]

#     product_data = {
#         'id': product.id,
#         'name': product.name,
#         'shape_type': product.shape_type,
#         'image_url': product.get_image_url,
#         'back_image_url': product.get_back_image_url,
#         'left_image_url': product.get_left_image_url,
#         'right_image_url': product.get_right_image_url,
#         'top_image_url': product.get_top_image_url,
#         'model_3d_url': product.model_3d.url if product.model_3d else None,
#         'material': product.material.name if product.material else None,
#         'imprint_methods': get_imprint_methods(product),
#     }
#     return render(request, 'customizer/customize.html', {
#         'product': product,
#         'product_json': json.dumps(product_data),
#         'zones_json': json.dumps(zones),
#     })

# @require_GET
# def api_products(request):
#     """API: Return list of all active products."""
#     products_qs = Product.objects.filter(is_active=True).select_related('material').prefetch_related(
#         'available_imprint_methods', 'material__compatible_methods'
#     )
    
#     # SaaS: Filter by client slug if provided
#     client_slug = request.GET.get('client', None)
#     if client_slug:
#         products_qs = products_qs.filter(client__slug=client_slug)
    
#     # Filter by embed_token if provided
#     embed_token = request.GET.get('embed_token', None)
#     if embed_token:
#         products_qs = products_qs.filter(embed_token=embed_token)

#     def get_imprint_methods(p):
#         # If product has explicit overrides use those; otherwise fall back to material defaults
#         methods = list(p.available_imprint_methods.all())
#         if not methods and p.material:
#             methods = list(p.material.compatible_methods.all())
#         return [{'id': m.id, 'name': m.name, 'visual_effect': m.visual_effect, 'supports_color': m.supports_color} for m in methods]

#     products = [{
#         'id': p.id,
#         'name': p.name,
#         'shape_type': p.shape_type,
#         'image_url': p.get_image_url,
#         'back_image_url': p.get_back_image_url,
#         'left_image_url': p.get_left_image_url,
#         'right_image_url': p.get_right_image_url,
#         'top_image_url': p.get_top_image_url,
#         'model_3d_url': p.model_3d.url if p.model_3d else None,
#         'external_product_url': p.external_product_url,
#         'external_product_id': p.external_product_id,
#         'embed_token': p.embed_token,
#         'tripo_job_id': p.tripo_job_id,
#         'tripo_model_url': p.tripo_model_url,
#         'tripo_status': p.tripo_status,
#         'material': p.material.name if p.material else None,
#         'client_slug': p.client.slug if p.client else None,
#         'imprint_methods': get_imprint_methods(p),
#     } for p in products_qs]
#     return JsonResponse(products, safe=False)


# @require_GET
# def api_clients(request):
#     """API: Return list of active clients for admin selection."""
#     clients_qs = Client.objects.filter(is_active=True)
#     clients = [{
#         'id': c.id,
#         'name': c.name,
#         'slug': c.slug,
#         'primary_color': c.primary_color,
#         'logo_url': c.logo.url if c.logo else None,
#         'is_active': c.is_active,
#     } for c in clients_qs]
#     return JsonResponse(clients, safe=False)


# @csrf_exempt
# def create_client(request):
#     if request.method != 'POST':
#         return JsonResponse({'error': 'POST required'}, status=405)

#     try:
#         name = request.POST.get('name', '').strip()
#         slug = request.POST.get('slug', '').strip() or slugify(name)
#         primary_color = request.POST.get('primary_color', '#6c63ff').strip() or '#6c63ff'
#         is_active = request.POST.get('is_active', 'true').lower() in ('true', '1', 'yes')

#         if not name:
#             return JsonResponse({'error': 'Client name is required.'}, status=400)

#         if Client.objects.filter(slug=slug).exists():
#             return JsonResponse({'error': 'Client slug already exists.'}, status=400)

#         client = Client.objects.create(name=name, slug=slug, primary_color=primary_color, is_active=is_active)
#         return JsonResponse({
#             'success': True,
#             'id': client.id,
#             'name': client.name,
#             'slug': client.slug,
#             'primary_color': client.primary_color,
#             'logo_url': client.logo.url if client.logo else None,
#             'is_active': client.is_active,
#         })
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=400)


# @csrf_exempt
# def update_client(request, pk):
#     if request.method not in ('POST', 'PUT', 'PATCH'):
#         return JsonResponse({'error': 'POST/PUT/PATCH required'}, status=405)

#     client = get_object_or_404(Client, pk=pk)
#     try:
#         name = request.POST.get('name', '').strip()
#         slug = request.POST.get('slug', '').strip()
#         primary_color = request.POST.get('primary_color', '').strip()
#         is_active = request.POST.get('is_active')

#         if name:
#             client.name = name
#         if slug:
#             if client.slug != slug and Client.objects.filter(slug=slug).exists():
#                 return JsonResponse({'error': 'Client slug already exists.'}, status=400)
#             client.slug = slug
#         if primary_color:
#             client.primary_color = primary_color
#         if is_active is not None:
#             client.is_active = is_active.lower() in ('true', '1', 'yes')

#         client.save()
#         return JsonResponse({
#             'success': True,
#             'id': client.id,
#             'name': client.name,
#             'slug': client.slug,
#             'primary_color': client.primary_color,
#             'logo_url': client.logo.url if client.logo else None,
#             'is_active': client.is_active,
#         })
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=400)


# @csrf_exempt
# def delete_client(request, pk):
#     if request.method != 'DELETE':
#         body_method = ''
#         try:
#             body = json.loads(request.body)
#             body_method = body.get('_method', '')
#         except Exception:
#             pass
#         if request.method == 'POST' and body_method.upper() == 'DELETE':
#             pass
#         else:
#             return JsonResponse({'error': 'DELETE required'}, status=405)

#     client = get_object_or_404(Client, pk=pk)
#     try:
#         client.delete()
#         return JsonResponse({'success': True})
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=400)


# @csrf_exempt
# def create_product(request):
#     """API: Create a new product. Accepts multipart/form-data."""
#     if request.method != 'POST':
#         return JsonResponse({'error': 'POST required'}, status=405)
#     try:
#         name = request.POST.get('name', '').strip()
#         shape_type = request.POST.get('shape_type', 'flat')
#         client_slug = request.POST.get('client_slug', '').strip()
#         if not name:
#             return JsonResponse({'error': 'Product name is required'}, status=400)

#         p = Product(name=name, shape_type=shape_type, is_active=True)
#         if client_slug:
#             client = Client.objects.filter(slug=client_slug, is_active=True).first()
#             if client:
#                 p.client = client

#         for field in ['external_product_url', 'external_product_id', 'tripo_job_id', 'tripo_model_url', 'tripo_status']:
#             val = request.POST.get(field, '').strip()
#             if val:
#                 setattr(p, field, val)

#         # Handle image URLs (text fallbacks)
#         for field in ['image_url', 'back_image_url', 'left_image_url', 'right_image_url', 'top_image_url']:
#             val = request.POST.get(field, '').strip()
#             if val:
#                 setattr(p, field, val)
        
#         # Auto-scrape image from external_product_url if provided and image_url is not set
#         external_url = request.POST.get('external_product_url', '').strip()
#         if external_url and not request.POST.get('image_url', '').strip():
#             import re
#             from urllib.parse import urljoin, urlparse
#             import logging
#             logger = logging.getLogger(__name__)
            
#             # Check if it's a direct image URL
#             image_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']
#             if any(external_url.lower().endswith(ext) for ext in image_extensions):
#                 logger.info(f"external_product_url is a direct image URL, storing in image_url: {external_url}")
#                 p.image_url = external_url
#             else:
#                 # Try to scrape the storefront URL
#                 try:
#                     headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
#                     resp = requests.get(external_url, headers=headers, timeout=15, allow_redirects=True)
#                     resp.raise_for_status()
                    
#                     base_url = resp.url
#                     scraped_img_url = None
                    
#                     def resolve_url(url):
#                         if url.startswith('http'):
#                             return url
#                         return urljoin(base_url, url)
                    
#                     def clean_url(url):
#                         parsed = urlparse(url)
#                         return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                    
#                     # Try meta tags
#                     patterns = [
#                         r'<meta[^>]*property=[\'"]og:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                         r'<meta[^>]*name=[\'"]twitter:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                         r'<meta[^>]*property=[\'"]product:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                         r'<meta[^>]*name=[\'"]image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                         r'<link[^>]*rel=[\'"]image_src[\'"][^>]*href=[\'"]([^\'"]+)[\'"]',
#                     ]
                    
#                     for pattern in patterns:
#                         match = re.search(pattern, resp.text, re.IGNORECASE)
#                         if match:
#                             scraped_img_url = resolve_url(match.group(1))
#                             break
                    
#                     # Try img tags if no meta tags found
#                     if not scraped_img_url:
#                         img_patterns = [
#                             r'<img[^>]*class=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
#                             r'<img[^>]*id=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
#                         ]
                        
#                         for pattern in img_patterns:
#                             match = re.search(pattern, resp.text, re.IGNORECASE)
#                             if match:
#                                 scraped_img_url = resolve_url(match.group(1))
#                                 break
                        
#                         # Fallback to first reasonable image
#                         if not scraped_img_url:
#                             all_imgs = re.findall(r'<img[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', resp.text, re.IGNORECASE)
#                             for img_src in all_imgs:
#                                 if not any(skip in img_src.lower() for skip in ['icon', 'logo', 'favicon', 'sprite', 'badge', 'banner']):
#                                     if any(ext in img_src.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
#                                         scraped_img_url = resolve_url(img_src)
#                                         break
                    
#                     if scraped_img_url:
#                         scraped_img_url = clean_url(scraped_img_url)
#                         p.image_url = scraped_img_url
#                         logger.info(f"Auto-scraped and stored image URL: {scraped_img_url}")
#                     else:
#                         logger.warning(f"Could not scrape image from {external_url}")
                        
#                 except Exception as e:
#                     logger.warning(f"Failed to scrape image from external_product_url: {e}")
#                     # Don't fail the product creation if scraping fails

#         p.save()

#         # Handle file uploads after initial save so pk exists
#         file_map = {
#             'image': 'image',
#             'back_image': 'back_image',
#             'left_image': 'left_image',
#             'right_image': 'right_image',
#             'top_image': 'top_image',
#             'model_3d': 'model_3d',
#         }
#         updated = False
#         for form_field, model_field in file_map.items():
#             f = request.FILES.get(form_field)
#             if f:
#                 setattr(p, model_field, f)
#                 updated = True
#         if updated:
#             p.save()

#         return JsonResponse({
#             'success': True,
#             'id': p.id,
#             'name': p.name,
#             'shape_type': p.shape_type,
#             'image_url': p.get_image_url,
#             'back_image_url': p.get_back_image_url,
#             'left_image_url': p.get_left_image_url,
#             'right_image_url': p.get_right_image_url,
#             'top_image_url': p.get_top_image_url,
#             'model_3d_url': p.model_3d.url if p.model_3d else None,
#             'external_product_url': p.external_product_url,
#             'image_scraped': bool(p.image_url and external_url),  # Indicate if image was scraped
#         })
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=400)


# @csrf_exempt
# def update_product(request, pk):
#     """API: Update an existing product by pk. Accepts multipart/form-data."""
#     if request.method not in ('POST', 'PUT', 'PATCH'):
#         return JsonResponse({'error': 'POST/PUT required'}, status=405)
#     try:
#         p = get_object_or_404(Product, pk=pk)

#         name = request.POST.get('name', '').strip()
#         if name:
#             p.name = name
#         shape_type = request.POST.get('shape_type', '').strip()
#         if shape_type:
#             p.shape_type = shape_type
#         client_slug = request.POST.get('client_slug', '').strip()
#         if client_slug:
#             client = Client.objects.filter(slug=client_slug, is_active=True).first()
#             if client:
#                 p.client = client
#         is_active = request.POST.get('is_active')
#         if is_active is not None:
#             p.is_active = is_active.lower() in ('true', '1', 'yes')

#         for field in ['external_product_url', 'external_product_id', 'tripo_job_id', 'tripo_model_url', 'tripo_status']:
#             val = request.POST.get(field, '').strip()
#             if val:
#                 setattr(p, field, val)

#         for field in ['image_url', 'back_image_url', 'left_image_url', 'right_image_url', 'top_image_url']:
#             val = request.POST.get(field, '')
#             if val.strip():
#                 setattr(p, field, val.strip())
        
#         # Auto-scrape image from external_product_url if provided and image_url is not set
#         external_url = request.POST.get('external_product_url', '').strip()
#         if external_url and not request.POST.get('image_url', '').strip():
#             import re
#             from urllib.parse import urljoin, urlparse
#             import logging
#             logger = logging.getLogger(__name__)
            
#             # Check if it's a direct image URL
#             image_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']
#             if any(external_url.lower().endswith(ext) for ext in image_extensions):
#                 logger.info(f"external_product_url is a direct image URL, storing in image_url: {external_url}")
#                 p.image_url = external_url
#             else:
#                 # Try to scrape the storefront URL
#                 try:
#                     headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
#                     resp = requests.get(external_url, headers=headers, timeout=15, allow_redirects=True)
#                     resp.raise_for_status()
                    
#                     base_url = resp.url
#                     scraped_img_url = None
                    
#                     def resolve_url(url):
#                         if url.startswith('http'):
#                             return url
#                         return urljoin(base_url, url)
                    
#                     def clean_url(url):
#                         parsed = urlparse(url)
#                         return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                    
#                     # Try meta tags
#                     patterns = [
#                         r'<meta[^>]*property=[\'"]og:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                         r'<meta[^>]*name=[\'"]twitter:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                         r'<meta[^>]*property=[\'"]product:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                         r'<meta[^>]*name=[\'"]image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                         r'<link[^>]*rel=[\'"]image_src[\'"][^>]*href=[\'"]([^\'"]+)[\'"]',
#                     ]
                    
#                     for pattern in patterns:
#                         match = re.search(pattern, resp.text, re.IGNORECASE)
#                         if match:
#                             scraped_img_url = resolve_url(match.group(1))
#                             break
                    
#                     # Try img tags if no meta tags found
#                     if not scraped_img_url:
#                         img_patterns = [
#                             r'<img[^>]*class=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
#                             r'<img[^>]*id=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
#                         ]
                        
#                         for pattern in img_patterns:
#                             match = re.search(pattern, resp.text, re.IGNORECASE)
#                             if match:
#                                 scraped_img_url = resolve_url(match.group(1))
#                                 break
                        
#                         # Fallback to first reasonable image
#                         if not scraped_img_url:
#                             all_imgs = re.findall(r'<img[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', resp.text, re.IGNORECASE)
#                             for img_src in all_imgs:
#                                 if not any(skip in img_src.lower() for skip in ['icon', 'logo', 'favicon', 'sprite', 'badge', 'banner']):
#                                     if any(ext in img_src.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
#                                         scraped_img_url = resolve_url(img_src)
#                                         break
                    
#                     if scraped_img_url:
#                         scraped_img_url = clean_url(scraped_img_url)
#                         p.image_url = scraped_img_url
#                         logger.info(f"Auto-scraped and stored image URL: {scraped_img_url}")
#                     else:
#                         logger.warning(f"Could not scrape image from {external_url}")
                        
#                 except Exception as e:
#                     logger.warning(f"Failed to scrape image from external_product_url: {e}")
#                     # Don't fail the product update if scraping fails

#         p.save()

#         # Clear image fields when frontend signals removal
#         SIDE_CLEAR_MAP = {
#             'front': ('image', 'image_url'),
#             'back':  ('back_image', 'back_image_url'),
#             'left':  ('left_image', 'left_image_url'),
#             'right': ('right_image', 'right_image_url'),
#             'top':   ('top_image', 'top_image_url'),
#         }
#         cleared = False
#         for side, (file_field, url_field) in SIDE_CLEAR_MAP.items():
#             if request.POST.get(f'clear_{side}_image') == '1':
#                 setattr(p, file_field, None)
#                 setattr(p, url_field, '')
#                 cleared = True
#         if cleared:
#             p.save()

#         file_map = {
#             'image': 'image',
#             'back_image': 'back_image',
#             'left_image': 'left_image',
#             'right_image': 'right_image',
#             'top_image': 'top_image',
#             'model_3d': 'model_3d',
#         }
#         updated = False
#         for form_field, model_field in file_map.items():
#             f = request.FILES.get(form_field)
#             if f:
#                 setattr(p, model_field, f)
#                 updated = True
#         if updated:
#             p.save()

#         return JsonResponse({
#             'success': True,
#             'id': p.id,
#             'name': p.name,
#             'shape_type': p.shape_type,
#             'client_slug': p.client.slug if p.client else None,
#             'external_product_url': p.external_product_url or None,
#             'external_product_id': p.external_product_id or None,
#             'tripo_job_id': p.tripo_job_id or None,
#             'tripo_model_url': p.tripo_model_url or None,
#             'tripo_status': p.tripo_status or None,
#             'embed_token': p.embed_token,
#             'image_url': p.get_image_url,
#             'back_image_url': p.get_back_image_url,
#             'left_image_url': p.get_left_image_url,
#             'right_image_url': p.get_right_image_url,
#             'top_image_url': p.get_top_image_url,
#             'model_3d_url': p.model_3d.url if p.model_3d else None,
#             'image_scraped': bool(p.image_url and request.POST.get('external_product_url', '').strip()),
#         })
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=400)


# @csrf_exempt
# def delete_product(request, pk):
#     """API: Delete a product by pk."""
#     if request.method != 'DELETE':
#         # Allow a POST with _method=DELETE for simplicity
#         body_method = ''
#         try:
#             body = json.loads(request.body)
#             body_method = body.get('_method', '')
#         except Exception:
#             pass
#         if request.method == 'POST' and body_method.upper() == 'DELETE':
#             pass
#         else:
#             return JsonResponse({'error': 'DELETE required'}, status=405)
#     try:
#         p = get_object_or_404(Product, pk=pk)
#         p.delete()
#         return JsonResponse({'success': True})
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=400)

# @require_GET
# def debug_tripo_balance(request):
#     """
#     Debug endpoint to check Tripo API key and balance
#     """
#     try:
#         from customizer.services.tripo import TripoService
#         from django.conf import settings
#         import os
        
#         # Show what API key is being used
#         env_key = os.environ.get('TRIPO_API_KEY', 'Not found in env')
#         settings_key = getattr(settings, 'TRIPO_API_KEY', 'Not found in settings')
        
#         return JsonResponse({
#             'success': True,
#             'debug_info': {
#                 'env_api_key': env_key[:8] + '...' + env_key[-4:] if len(env_key) > 12 else env_key,
#                 'settings_api_key': settings_key[:8] + '...' + settings_key[-4:] if len(settings_key) > 12 else settings_key,
#                 'keys_match': env_key == settings_key
#             },
#             'balance': TripoService.check_balance()
#         })
#     except Exception as e:
#         return JsonResponse({
#             'error': str(e),
#             'debug_info': 'Failed to check Tripo balance'
#         }, status=500)

# @csrf_exempt
# @require_POST
# def reset_tripo_status(request, pk):
#     """
#     Reset the Tripo status for a product (useful for stuck pending states)
#     """
#     try:
#         p = get_object_or_404(Product, pk=pk)
#         p.tripo_status = ''
#         p.tripo_job_id = ''
#         p.tripo_model_url = ''
#         p.save()
#         return JsonResponse({'success': True, 'message': 'Tripo status reset successfully'})
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=500)

# @csrf_exempt
# @require_POST
# def generate_product_3d(request, pk):
#     """
#     Trigger Tripo 3D generation from the product's primary image.
#     Starts the async job and returns the job ID.
#     """
#     try:
#         from customizer.services.tripo import TripoService
#         p = get_object_or_404(Product, pk=pk)
        
#         # Get texture quality from request (default: standard)
#         texture_quality = request.POST.get('texture_quality', 'standard')
        
#         # We need an image to generate from. Priority: image, then image_url, then scrape external_product_url
#         import logging
#         logger = logging.getLogger(__name__)
        
#         logger.info(f"Product {p.id} - has image: {bool(p.image)}, has image_url: {bool(p.image_url)}, image_url value: {p.image_url}")
#         logger.info(f"Using texture quality: {texture_quality}")
        
#         if p.image:
#             # TripoService needs an absolute path or accessible URL.
#             # Local dev URLs won't work for Tripo, so we use upload_file for local files.
#             logger.info(f"Using local file from p.image: {p.image.path}")
#             file_path = p.image.path
#             try:
#                 task_id = TripoService.generate_from_local_file(file_path, texture_quality=texture_quality)
#             except Exception as e:
#                 logger.error(f"Tripo API call failed for local file: {e}")
#                 import traceback
#                 return JsonResponse({
#                     'error': f'Tripo API error: {str(e)}',
#                     'debug_info': {
#                         'traceback': traceback.format_exc(),
#                         'file_path': file_path,
#                         'note': 'Failed to generate 3D model from local file'
#                     }
#                 }, status=400)
#         elif p.image_url:
#             # Check if image_url is accessible (not localhost)
#             logger.info(f"Using image_url: {p.image_url}")
            
#             if 'localhost' in p.image_url or '127.0.0.1' in p.image_url:
#                 # Download the localhost image to a temp file first
#                 logger.info(f"Detected localhost URL, downloading image locally: {p.image_url}")
#                 import tempfile
#                 import os
#                 from urllib.parse import urlparse
                
#                 # Download the image
#                 try:
#                     response = requests.get(p.image_url, timeout=15)
#                     response.raise_for_status()
#                 except requests.exceptions.RequestException as e:
#                     # Network/download error when trying to access localhost
#                     logger.error(f"Failed to download localhost image: {e}")
#                     import traceback
#                     return JsonResponse({
#                         'error': f'Failed to download image from localhost URL: {str(e)}',
#                         'debug_info': {
#                             'traceback': traceback.format_exc(),
#                             'image_url': p.image_url
#                         }
#                     }, status=400)
                
#                 # Determine file extension from URL
#                 parsed_url = urlparse(p.image_url)
#                 ext = os.path.splitext(parsed_url.path)[1] or '.jpg'
                
#                 # Save to temp file
#                 with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
#                     temp_file.write(response.content)
#                     temp_path = temp_file.name
                
#                 logger.info(f"Downloaded localhost image to temp file: {temp_path}")
                
#                 try:
#                     task_id = TripoService.generate_from_local_file(temp_path, texture_quality=texture_quality)
#                 except Exception as e:
#                     # Tripo API error (likely insufficient credits)
#                     logger.error(f"Tripo API call failed after downloading localhost image: {e}")
#                     import traceback
#                     return JsonResponse({
#                         'error': f'Tripo API error: {str(e)}',
#                         'debug_info': {
#                             'traceback': traceback.format_exc(),
#                             'image_url': p.image_url,
#                             'note': 'Image was successfully downloaded from localhost, but Tripo API call failed'
#                         }
#                     }, status=400)
#                 finally:
#                     # Clean up temp file
#                     if os.path.exists(temp_path):
#                         os.unlink(temp_path)
#             else:
#                 # Assumes the image_url is public
#                 logger.info(f"Using public URL method for: {p.image_url}")
#                 try:
#                     task_id = TripoService.generate_from_image(p.image_url, texture_quality=texture_quality)
#                 except Exception as e:
#                     logger.error(f"Tripo API call failed for public URL: {e}")
#                     import traceback
#                     return JsonResponse({
#                         'error': f'Tripo API error: {str(e)}',
#                         'debug_info': {
#                             'traceback': traceback.format_exc(),
#                             'image_url': p.image_url,
#                             'note': 'Failed to generate 3D model from public URL'
#                         }
#                     }, status=400)
#         elif p.external_product_url:
#             import logging
#             logger = logging.getLogger(__name__)
            
#             # Check if external_product_url is actually a direct image URL
#             image_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']
#             if any(p.external_product_url.lower().endswith(ext) for ext in image_extensions):
#                 # It's a direct image URL, store it in image_url and use it
#                 logger.info(f"external_product_url appears to be a direct image URL, storing it in image_url: {p.external_product_url}")
#                 p.image_url = p.external_product_url
#                 p.save()
#                 try:
#                     task_id = TripoService.generate_from_image(p.image_url, texture_quality=texture_quality)
#                 except Exception as e:
#                     logger.error(f"Tripo API call failed for external product URL (direct image): {e}")
#                     import traceback
#                     return JsonResponse({
#                         'error': f'Tripo API error: {str(e)}',
#                         'debug_info': {
#                             'traceback': traceback.format_exc(),
#                             'external_product_url': p.external_product_url,
#                             'note': 'Failed to generate 3D model from external product URL (direct image)'
#                         }
#                     }, status=400)
#             else:
#                 # It's a storefront URL, scrape it for images
#                 import re
#                 from urllib.parse import urljoin, urlparse
                
#                 headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
                
#                 # Allow redirects and follow them
#                 resp = requests.get(p.external_product_url, headers=headers, timeout=15, allow_redirects=True)
#                 resp.raise_for_status()
                
#                 # Use the final URL after redirects as the base
#                 base_url = resp.url
#                 logger.info(f"Scraping image from: {base_url}")
                
#                 scraped_img_url = None
                
#                 # Helper to resolve relative URLs
#                 def resolve_url(url):
#                     if url.startswith('http'):
#                         return url
#                     return urljoin(base_url, url)
                
#                 # Helper to clean URLs (remove query params, fragments)
#                 def clean_url(url):
#                     parsed = urlparse(url)
#                     return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                
#                 # Try multiple meta tag patterns (case insensitive)
#                 patterns = [
#                     r'<meta[^>]*property=[\'"]og:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                     r'<meta[^>]*name=[\'"]twitter:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                     r'<meta[^>]*property=[\'"]product:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                     r'<meta[^>]*name=[\'"]image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                     r'<link[^>]*rel=[\'"]image_src[\'"][^>]*href=[\'"]([^\'"]+)[\'"]',
#                     r'<meta[^>]*property=[\'"]og:image:url[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                     r'<meta[^>]*property=[\'"]og:image:secure_url[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
#                 ]
                
#                 for pattern in patterns:
#                     match = re.search(pattern, resp.text, re.IGNORECASE)
#                     if match:
#                         scraped_img_url = resolve_url(match.group(1))
#                         logger.info(f"Found image via meta tag pattern: {pattern[:30]}... -> {scraped_img_url}")
#                         break
                
#                 # If no meta tags found, try to find the main product image in img tags
#                 if not scraped_img_url:
#                     # Look for img tags with common product-related classes/ids
#                     img_patterns = [
#                         r'<img[^>]*class=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
#                         r'<img[^>]*id=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
#                         r'<img[^>]*alt=[\'"][^\'"]*(?:product|main|primary)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
#                         r'<img[^>]*src=[\'"]([^\'"]+\.(?:jpg|jpeg|png|webp))[\'"][^>]*(?:class=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"])?',
#                     ]
                    
#                     for pattern in img_patterns:
#                         match = re.search(pattern, resp.text, re.IGNORECASE)
#                         if match:
#                             scraped_img_url = resolve_url(match.group(1))
#                             logger.info(f"Found image via img tag pattern: {pattern[:30]}... -> {scraped_img_url}")
#                             break
                    
#                     # Last resort: get the first reasonably sized img tag (avoid tiny icons)
#                     if not scraped_img_url:
#                         all_imgs = re.findall(r'<img[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', resp.text, re.IGNORECASE)
#                         for img_src in all_imgs:
#                             # Skip very small images (likely icons, logos, etc.)
#                             if any(skip in img_src.lower() for skip in ['icon', 'logo', 'favicon', 'sprite', 'badge', 'banner']):
#                                 continue
#                             # Prefer larger image formats
#                             if any(ext in img_src.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
#                                 scraped_img_url = resolve_url(img_src)
#                                 logger.info(f"Found image via fallback: {scraped_img_url}")
#                                 break
                
#                 if not scraped_img_url:
#                     logger.error(f"Could not find any suitable image on {base_url}")
#                     # Fallback: try to use image_url if available
#                     if p.image_url:
#                         logger.info(f"Falling back to existing image_url: {p.image_url}")
#                         try:
#                             task_id = TripoService.generate_from_image(p.image_url, texture_quality=texture_quality)
#                         except Exception as e:
#                             logger.error(f"Tripo API call failed for fallback image_url: {e}")
#                             import traceback
#                             return JsonResponse({
#                                 'error': f'Tripo API error: {str(e)}',
#                                 'debug_info': {
#                                     'traceback': traceback.format_exc(),
#                                     'fallback_image_url': p.image_url,
#                                     'external_product_url': p.external_product_url,
#                                     'note': 'Failed to generate 3D model from fallback image URL'
#                                 }
#                             }, status=400)
#                     else:
#                         # Count how many images we found for debugging
#                         all_imgs = re.findall(r'<img[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', resp.text, re.IGNORECASE)
#                         logger.info(f"Found {len(all_imgs)} img tags on the page")
                        
#                         return JsonResponse({
#                             'error': 'Could not find a product image on the provided storefront URL. Please upload an image directly or provide a URL with proper meta tags.',
#                             'suggestion': 'Try uploading the product image directly instead of using a storefront URL.',
#                             'debug_info': {
#                                 'url_scraped': base_url,
#                                 'total_images_found': len(all_imgs),
#                                 'has_image_url': bool(p.image_url),
#                                 'has_uploaded_image': bool(p.image)
#                             }
#                         }, status=400)
#                 else:
#                     # Clean and validate the URL
#                     scraped_img_url = clean_url(scraped_img_url)
#                     logger.info(f"Final scraped image URL: {scraped_img_url}")
                    
#                     # Store the scraped URL in the database for future use
#                     p.image_url = scraped_img_url
#                     p.save()
#                     logger.info(f"Stored scraped image URL in database for product {p.id}")
                    
#                     try:
#                         task_id = TripoService.generate_from_image(p.image_url, texture_quality=texture_quality)
#                     except Exception as e:
#                         logger.error(f"Tripo API call failed for scraped image: {e}")
#                         import traceback
#                         return JsonResponse({
#                             'error': f'Tripo API error: {str(e)}',
#                             'debug_info': {
#                                 'traceback': traceback.format_exc(),
#                                 'scraped_image_url': scraped_img_url,
#                                 'external_product_url': p.external_product_url,
#                                 'note': 'Failed to generate 3D model from scraped image'
#                             }
#                         }, status=400)
#         else:
#             return JsonResponse({'error': 'Product has no image or storefront URL to generate from.'}, status=400)
            
#         p.tripo_job_id = task_id
#         p.tripo_status = 'pending'
#         p.tripo_model_url = None  # Clear previous model URL if any
#         p.save()
        
#         return JsonResponse({'success': True, 'task_id': task_id, 'status': 'pending'})
        
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=500)

# @csrf_exempt
# @require_POST
# def create_tripo_model(request):
#     try:
#         data = json.loads(request.body)

#         response = requests.post(
#             "https://openapi.tripo3d.ai/v3/generation/text-to-model",
#             headers={
#                 "Authorization": f"Bearer {settings.TRIPO_API_KEY}",
#                 "Content-Type": "application/json",
#             },
#             json={
#                 "prompt": data.get("prompt"),
#                 "model": "v3.1-20260211",
#             },
#             timeout=30,
#         )

#         return JsonResponse(response.json(), safe=False)

#     except Exception as e:
#         return JsonResponse({"error": str(e)}, status=500)

# @csrf_exempt
# def image_to_3d(request):
#     """
#     API: Convert an uploaded image to 3D model using Tripo.ai
#     Accepts multipart/form-data with an image file
#     Returns task_id for async processing
#     """
#     if request.method != 'POST':
#         return JsonResponse({'error': 'POST required'}, status=405)
    
#     try:
#         if 'image' not in request.FILES:
#             return JsonResponse({'error': 'No image file provided'}, status=400)
        
#         image_file = request.FILES['image']
        
#         # Get optional parameters from form data
#         model_version = request.POST.get('model_version', 'v3.1-20260211')
#         texture_quality = request.POST.get('texture_quality', 'standard')
#         face_limit = request.POST.get('face_limit')
        
#         # Build kwargs for Tripo service
#         kwargs = {
#             'texture_quality': texture_quality,
#         }
        
#         if face_limit:
#             try:
#                 kwargs['face_limit'] = int(face_limit)
#             except ValueError:
#                 return JsonResponse({'error': 'Invalid face_limit value'}, status=400)
        
#         # Save uploaded file temporarily
#         import tempfile
#         import os
        
#         with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_file:
#             for chunk in image_file.chunks():
#                 temp_file.write(chunk)
#             temp_path = temp_file.name
        
#         try:
#             from customizer.services.tripo import TripoService
#             task_id = TripoService.generate_from_local_file(temp_path, model_version=model_version, texture_quality=texture_quality, face_limit=face_limit)
            
#             return JsonResponse({
#                 'success': True,
#                 'task_id': task_id,
#                 'status': 'pending',
#                 'message': '3D generation started successfully'
#             })
#         finally:
#             # Clean up temporary file
#             if os.path.exists(temp_path):
#                 os.unlink(temp_path)
                
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=500)

# @csrf_exempt
# def get_tripo_task_status(request, task_id):
#     """
#     API: Check the status of a Tripo 3D generation task
#     Returns task status, progress, and model URL if complete
#     """
#     if request.method != 'GET':
#         return JsonResponse({'error': 'GET required'}, status=405)
    
#     try:
#         from customizer.services.tripo import TripoService
#         result = TripoService.get_task_status(task_id)
        
#         return JsonResponse({
#             'success': True,
#             'task_id': task_id,
#             'status': result.get('status'),
#             'progress': result.get('progress', 0),
#             'model_url': result.get('model_url'),
#             'rendered_image_url': result.get('rendered_image_url')
#         })
        
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=500)

# @csrf_exempt
# @require_POST
# def complete_tripo_generation(request):
#     """
#     API: Download and store the generated 3D model from Tripo
#     This should be called when the task status is 'success'
#     Downloads both the model_url and rendered_image_url (preview thumbnail)
#     """
#     try:
#         from customizer.services.tripo import TripoService
#         import os
#         from django.core.files import File
#         import logging
#         logger = logging.getLogger(__name__)
        
#         data = json.loads(request.body)
#         task_id = data.get('task_id')
#         product_id = data.get('product_id')
        
#         if not task_id or not product_id:
#             return JsonResponse({'error': 'task_id and product_id are required'}, status=400)
        
#         # Get the task status to retrieve the model URL and rendered image URL
#         result = TripoService.get_task_status(task_id)
        
#         if result.get('status') != 'success':
#             return JsonResponse({'error': 'Task is not completed yet'}, status=400)
        
#         model_url = result.get('model_url')
#         if not model_url:
#             return JsonResponse({'error': 'No model URL available'}, status=400)
        
#         rendered_image_url = result.get('rendered_image_url')
        
#         # Get the product
#         product = get_object_or_404(Product, pk=product_id)
        
#         # Download the model file with retry logic
#         logger.info(f"Downloading 3D model from Tripo: {model_url}")
#         max_retries = 3
#         retry_delay = 2
        
#         for attempt in range(max_retries):
#             try:
#                 model_response = requests.get(model_url, timeout=30)
#                 model_response.raise_for_status()
#                 break
#             except requests.exceptions.RequestException as e:
#                 if attempt < max_retries - 1:
#                     logger.warning(f"Download attempt {attempt + 1} failed, retrying in {retry_delay}s: {e}")
#                     time.sleep(retry_delay)
#                     retry_delay *= 2
#                 else:
#                     raise Exception(f"Failed to download model after {max_retries} attempts: {e}")
        
#         # Create a temporary file and save the downloaded model content
#         import tempfile
#         with tempfile.NamedTemporaryFile(delete=False, suffix='.glb') as temp_file:
#             temp_file.write(model_response.content)
#             model_temp_path = temp_file.name
        
#         try:
#             # Save the model file to the product's model_3d field
#             with open(model_temp_path, 'rb') as f:
#                 product.model_3d.save(f'{product.name.replace(" ", "_")}_3d.glb', File(f), save=False)
            
#             logger.info(f"Model downloaded successfully, size: {len(model_response.content)} bytes")
            
#             # Download and save the rendered image (preview thumbnail) if available
#             if rendered_image_url:
#                 logger.info(f"Downloading preview image from Tripo: {rendered_image_url}")
#                 try:
#                     # Download with retry logic
#                     max_retries = 3
#                     retry_delay = 2
#                     image_response = None
                    
#                     for attempt in range(max_retries):
#                         try:
#                             image_response = requests.get(rendered_image_url, timeout=30)
#                             image_response.raise_for_status()
#                             break
#                         except requests.exceptions.RequestException as e:
#                             if attempt < max_retries - 1:
#                                 logger.warning(f"Image download attempt {attempt + 1} failed, retrying in {retry_delay}s: {e}")
#                                 time.sleep(retry_delay)
#                                 retry_delay *= 2
#                             else:
#                                 raise Exception(f"Failed to download preview image after {max_retries} attempts: {e}")
                    
#                     if image_response:
#                         # Determine file extension from URL or default to .png
#                         from urllib.parse import urlparse
#                         parsed_url = urlparse(rendered_image_url)
#                         ext = os.path.splitext(parsed_url.path)[1] or '.png'
                        
#                         # Create temporary file for the image
#                         with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_image_file:
#                             temp_image_file.write(image_response.content)
#                         image_temp_path = temp_image_file.name
                    
#                         try:
#                             # Save the image to the product's image field (or a dedicated preview field)
#                             # Using the existing image field as a preview/thumbnail
#                             with open(image_temp_path, 'rb') as img_f:
#                                 product.image.save(f'{product.name.replace(" ", "_")}_preview{ext}', File(img_f), save=False)
                            
#                             logger.info(f"Preview image downloaded successfully, size: {len(image_response.content)} bytes")
#                         finally:
#                             # Clean up temporary image file
#                             if os.path.exists(image_temp_path):
#                                 os.unlink(image_temp_path)
#                 except Exception as e:
#                     # Log but don't fail if preview image download fails
#                     logger.warning(f"Failed to download preview image: {e}")
            
#             # Save the product with all the updated fields
#             product.tripo_status = 'success'
#             product.tripo_model_url = model_url  # Keep the original URL as reference
#             product.save()
            
#             return JsonResponse({
#                 'success': True,
#                 'model_url': product.model_3d.url,
#                 'preview_url': product.image.url if product.image else None,
#                 'message': '3D model downloaded and stored successfully'
#             })
#         finally:
#             # Clean up temporary model file
#             if os.path.exists(model_temp_path):
#                 os.unlink(model_temp_path)
                
#     except Exception as e:
#         import logging
#         logger = logging.getLogger(__name__)
#         logger.error(f"Error completing Tripo generation: {e}")
#         return JsonResponse({'error': str(e)}, status=500)
# from django.http import HttpResponse
# from PIL import Image
# import io

# @csrf_exempt
# @require_POST
# def convert_vector(request):
#     """API: Convert EPS to PNG using Pillow (requires Ghostscript)."""
#     if "file" not in request.FILES:
#         return JsonResponse({"error": "No file uploaded"}, status=400)
    
#     upload = request.FILES["file"]
#     try:
#         # Load EPS file. Pillow uses Ghostscript in the background.
#         img = Image.open(upload)
        
#         # Load the image to force Ghostscript conversion
#         img.load()
        
#         # Convert to RGBA for PNG
#         if img.mode != "RGBA":
#             img = img.convert("RGBA")
            
#         # Save to memory buffer
#         buf = io.BytesIO()
#         img.save(buf, format="PNG")
#         buf.seek(0)
        
#         return HttpResponse(buf.getvalue(), content_type="image/png")
#     except Exception as e:
#         return JsonResponse({"error": f"Vector conversion failed: {str(e)}"}, status=500)

# @require_GET
# def api_client_info(request, slug):
#     '''API: Return public branding info for a client tenant.'''
#     try:
#         client = Client.objects.get(slug=slug, is_active=True)
#         return JsonResponse({
#             'name': client.name,
#             'slug': client.slug,
#             'primary_color': client.primary_color,
#             'logo_url': client.logo.url if client.logo else None,
#         })
#     except Client.DoesNotExist:
#         return JsonResponse({'error': 'Client not found'}, status=404)


# @csrf_exempt
# def create_design_submission(request):
#     if request.method != 'POST':
#         return JsonResponse({'error': 'POST required'}, status=405)

#     try:
#         data = json.loads(request.body)
#         client_slug = data.get('clientSlug')
#         product_id = data.get('productId')

#         client = Client.objects.filter(slug=client_slug, is_active=True).first() if client_slug else None
#         product = Product.objects.filter(pk=product_id, is_active=True).first() if product_id else None

#         submission = DesignSubmission.objects.create(
#             client=client,
#             product=product,
#             product_name=data.get('productName', '') or (product.name if product else ''),
#             design_preview_url=data.get('designPreviewUrl'),
#             pdf_spec_sheet_url=data.get('pdfSpecSheetDataUrl'),
#             color_name=data.get('configuration', {}).get('colorName'),
#             color_hex=data.get('configuration', {}).get('colorHex'),
#             imprint_method=data.get('configuration', {}).get('imprintMethod'),
#             imprint_color=data.get('configuration', {}).get('imprintColor'),
#             pms_number=data.get('configuration', {}).get('pmsNumber'),
#             quantity=data.get('configuration', {}).get('quantity', 1),
#             raw_payload=data,
#         )

#         return JsonResponse({'success': True, 'id': submission.id})
#     except Exception as e:
#         return JsonResponse({'error': str(e)}, status=400)


# @require_GET
# def list_product_submissions(request, pk):
#     """Admin: List all design submissions for a given product."""
#     submissions = DesignSubmission.objects.filter(product_id=pk).order_by('-created_at')
#     data = []
#     for s in submissions:
#         data.append({
#             'id': s.id,
#             'product_name': s.product_name,
#             'client': s.client.slug if s.client else None,
#             'color_name': s.color_name,
#             'color_hex': s.color_hex,
#             'imprint_method': s.imprint_method,
#             'quantity': s.quantity,
#             'created_at': s.created_at.strftime('%Y-%m-%d %H:%M:%S'),
#             'has_pdf': bool(s.pdf_spec_sheet_url),
#             'has_preview': bool(s.design_preview_url),
#             'preview_url': s.design_preview_url if s.design_preview_url and len(s.design_preview_url) < 500 else None,
#         })
#     return JsonResponse({'submissions': data})


# @require_GET
# def download_submission_pdf(request, pk):
#     """Admin-only: Serve a stored base64 PDF data URL as a downloadable PDF file."""
#     import base64
#     submission = get_object_or_404(DesignSubmission, pk=pk)
#     if not submission.pdf_spec_sheet_url:
#         return JsonResponse({'error': 'No PDF available for this submission.'}, status=404)

#     # Strip the data URL header: "data:application/pdf;base64,<data>"
#     data_url = submission.pdf_spec_sheet_url
#     if ',' in data_url:
#         data_url = data_url.split(',', 1)[1]

#     try:
#         pdf_bytes = base64.b64decode(data_url)
#     except Exception:
#         return JsonResponse({'error': 'Invalid PDF data stored.'}, status=400)

#     safe_name = submission.product_name.replace(' ', '_') or 'design'
#     filename = f"{safe_name}_proof_{submission.created_at.strftime('%Y-%m-%d')}.pdf"

#     response = HttpResponse(pdf_bytes, content_type='application/pdf')
#     response['Content-Disposition'] = f'attachment; filename="{filename}"'
#     return response


# @require_GET
# def product_embed_snippet(request, pk):
#     """API: Return an HTML snippet for embedding a product."""
#     product = get_object_or_404(Product, pk=pk)
#     client_slug = product.client.slug if product.client else 'default'
#     host = request.build_absolute_uri('/')[:-1] # remove trailing slash
#     embed_url = f"{host}/embed/{client_slug}?embed_token={product.embed_token}"
    
#     snippet = (
#         f'<button onclick="window.open(\'{embed_url}\', \'3DDesigner\', \'width=1200,height=800,left=100,top=100\')" '
#         f'style="padding: 10px 24px; background-color: #0d99ff; color: #ffffff; border: none; border-radius: 8px; '
#         f'font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: background-color 0.2s;" '
#         f'onmouseover="this.style.backgroundColor=\'#0b80d6\'" '
#         f'onmouseout="this.style.backgroundColor=\'#0d99ff\'">'
#         f'Customize in 3D'
#         f'</button>'
#     )
#     return JsonResponse({'snippet': snippet, 'embed_url': embed_url})


# import csv
# from django.http import HttpResponse

# @require_GET
# def bulk_embed_export(request):
#     """API: Export embed tokens as CSV. Optional ?client=slug filter."""
#     products_qs = Product.objects.filter(is_active=True).select_related('client')
#     client_slug = request.GET.get('client')
#     if client_slug:
#         products_qs = products_qs.filter(client__slug=client_slug)
    
#     host = request.build_absolute_uri('/')[:-1]
    
#     response = HttpResponse(content_type='text/csv')
#     response['Content-Disposition'] = 'attachment; filename="embed_tokens.csv"'
    
#     writer = csv.writer(response)
#     writer.writerow(['Product Name', 'External Product ID', 'Embed Token', 'Embed URL'])
    
#     for p in products_qs:
#         c_slug = p.client.slug if p.client else 'default'
#         embed_url = f"{host}/embed/{c_slug}?embed_token={p.embed_token}"
#         writer.writerow([p.name, p.external_product_id or '', p.embed_token, embed_url])
        
#     return response


















import json
import time
import os
import re
import logging
from urllib.parse import urljoin, urlparse
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import csrf_exempt
from django.utils.text import slugify
from django.core.files.base import ContentFile
from .models import Product, DesignZone, Client, DesignSubmission
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
#  PAGE 1 — Product Gallery (Home)
# ─────────────────────────────────────────────────────────────────────────────
def gallery(request):
    products_qs = Product.objects.filter(is_active=True)
    products = [{'id': p.id, 'name': p.name, 'image_url': p.get_image_url} for p in products_qs]
    return render(request, 'customizer/gallery.html', {'products_json': json.dumps(products)})


# ─────────────────────────────────────────────────────────────────────────────
#  PAGE 2 — Setup Page (admin defines logo/text zones)
# ─────────────────────────────────────────────────────────────────────────────
def setup(request):
    """Page where admin visually defines logo and text zones on a product."""
    products_qs = Product.objects.filter(is_active=True)
    products = [{
        'id': p.id,
        'name': p.name,
        'shape_type': p.shape_type,
        'image_url': p.get_image_url,
        'back_image_url': p.get_back_image_url,
        'left_image_url': p.get_left_image_url,
        'right_image_url': p.get_right_image_url,
        'top_image_url': p.get_top_image_url,
        'model_3d_url': p.get_model_3d_url,
    } for p in products_qs]
    return render(request, 'customizer/setup.html', {'products_json': json.dumps(products)})


@csrf_exempt
@require_POST
def save_zones(request):
    """API: Receive zone data from setup page and save to DB."""
    try:
        data = json.loads(request.body)
        product_id = data.get('product_id')
        zones = data.get('zones', [])

        product = get_object_or_404(Product, pk=product_id)
        # Clear existing zones and replace
        product.zones.all().delete()
        for z in zones:
            DesignZone.objects.create(
                product=product,
                name=z.get('name', ''),
                side=z.get('side', 'front'),
                zone_type=z['zone_type'],
                x_percent=z['x_percent'],
                y_percent=z['y_percent'],
                width_percent=z['width_percent'],
                height_percent=z['height_percent'],
                angle=z.get('angle', 0.0),
                actual_width=z.get('actual_width', 12.0),
                actual_height=z.get('actual_height', 12.0),
                source=z.get('source', '2d'),
                point3d=z.get('point3d'),
                normal3d=z.get('normal3d'),
                size3d=z.get('size3d'),
            )
        return JsonResponse({'success': True, 'count': len(zones)})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@require_GET
def get_zones(request, pk):
    """API: Return product info + its design zones, side images, and shape type."""
    product = get_object_or_404(Product, pk=pk)
    zones = list(product.zones.values('id', 'name', 'side', 'zone_type', 'x_percent', 'y_percent', 'width_percent', 'height_percent', 'angle', 'actual_width', 'actual_height', 'source', 'point3d', 'normal3d', 'size3d'))
    return JsonResponse({
        'id': product.id,
        'name': product.name,
        'shape_type': product.shape_type,
        'image_url': product.get_image_url,
        'back_image_url': product.get_back_image_url,
        'left_image_url': product.get_left_image_url,
        'right_image_url': product.get_right_image_url,
        'top_image_url': product.get_top_image_url,
        'model_3d_url': product.get_model_3d_url,
        'zones': zones,
    })


# ─────────────────────────────────────────────────────────────────────────────
#  PAGE 3 — Customize Page (user uploads logo / types text)
# ─────────────────────────────────────────────────────────────────────────────
def customize(request, pk):
    product = get_object_or_404(Product, pk=pk, is_active=True)
    zones = list(product.zones.values('id', 'name', 'side', 'zone_type', 'x_percent', 'y_percent', 'width_percent', 'height_percent', 'angle', 'actual_width', 'actual_height', 'source', 'point3d', 'normal3d', 'size3d'))
    
    def get_imprint_methods(p):
        methods = list(p.available_imprint_methods.all())
        if not methods and p.material:
            methods = list(p.material.compatible_methods.all())
        return [{'id': m.id, 'name': m.name, 'visual_effect': m.visual_effect, 'supports_color': m.supports_color} for m in methods]

    product_data = {
        'id': product.id,
        'name': product.name,
        'shape_type': product.shape_type,
        'image_url': product.get_image_url,
        'back_image_url': product.get_back_image_url,
        'left_image_url': product.get_left_image_url,
        'right_image_url': product.get_right_image_url,
        'top_image_url': product.get_top_image_url,
        'model_3d_url': product.get_model_3d_url,
        'material': product.material.name if product.material else None,
        'imprint_methods': get_imprint_methods(product),
    }
    return render(request, 'customizer/customize.html', {
        'product': product,
        'product_json': json.dumps(product_data),
        'zones_json': json.dumps(zones),
    })

@require_GET
def api_products(request):
    """API: Return list of all active products."""
    products_qs = Product.objects.filter(is_active=True).select_related('material').prefetch_related(
        'available_imprint_methods', 'material__compatible_methods'
    )
    
    # SaaS: Filter by client slug if provided
    client_slug = request.GET.get('client', None)
    if client_slug:
        products_qs = products_qs.filter(client__slug=client_slug)
    
    # Filter by embed_token if provided
    embed_token = request.GET.get('embed_token', None)
    if embed_token:
        products_qs = products_qs.filter(embed_token=embed_token)

    def get_imprint_methods(p):
        # If product has explicit overrides use those; otherwise fall back to material defaults
        methods = list(p.available_imprint_methods.all())
        if not methods and p.material:
            methods = list(p.material.compatible_methods.all())
        return [{'id': m.id, 'name': m.name, 'visual_effect': m.visual_effect, 'supports_color': m.supports_color} for m in methods]

    products = [{
        'id': p.id,
        'name': p.name,
        'shape_type': p.shape_type,
        'image_url': p.get_image_url,
        'back_image_url': p.get_back_image_url,
        'left_image_url': p.get_left_image_url,
        'right_image_url': p.get_right_image_url,
        'top_image_url': p.get_top_image_url,
        'model_3d_url': p.get_model_3d_url,
        'external_product_url': p.external_product_url,
        'external_product_id': p.external_product_id,
        'embed_token': p.embed_token,
        'tripo_job_id': p.tripo_job_id,
        'tripo_model_url': p.tripo_model_url,
        'tripo_status': p.tripo_status,
        'material': p.material.name if p.material else None,
        'client_slug': p.client.slug if p.client else None,
        'imprint_methods': get_imprint_methods(p),
    } for p in products_qs]
    return JsonResponse(products, safe=False)


@require_GET
def api_clients(request):
    """API: Return list of active clients for admin selection."""
    clients_qs = Client.objects.filter(is_active=True)
    clients = [{
        'id': c.id,
        'name': c.name,
        'slug': c.slug,
        'primary_color': c.primary_color,
        'logo_url': c.logo.url if c.logo else None,
        'is_active': c.is_active,
    } for c in clients_qs]
    return JsonResponse(clients, safe=False)


@csrf_exempt
def create_client(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        name = request.POST.get('name', '').strip()
        slug = request.POST.get('slug', '').strip() or slugify(name)
        primary_color = request.POST.get('primary_color', '#6c63ff').strip() or '#6c63ff'
        is_active = request.POST.get('is_active', 'true').lower() in ('true', '1', 'yes')

        if not name:
            return JsonResponse({'error': 'Client name is required.'}, status=400)

        if Client.objects.filter(slug=slug).exists():
            return JsonResponse({'error': 'Client slug already exists.'}, status=400)

        client = Client.objects.create(name=name, slug=slug, primary_color=primary_color, is_active=is_active)
        return JsonResponse({
            'success': True,
            'id': client.id,
            'name': client.name,
            'slug': client.slug,
            'primary_color': client.primary_color,
            'logo_url': client.logo.url if client.logo else None,
            'is_active': client.is_active,
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
def update_client(request, pk):
    if request.method not in ('POST', 'PUT', 'PATCH'):
        return JsonResponse({'error': 'POST/PUT/PATCH required'}, status=405)

    client = get_object_or_404(Client, pk=pk)
    try:
        name = request.POST.get('name', '').strip()
        slug = request.POST.get('slug', '').strip()
        primary_color = request.POST.get('primary_color', '').strip()
        is_active = request.POST.get('is_active')

        if name:
            client.name = name
        if slug:
            if client.slug != slug and Client.objects.filter(slug=slug).exists():
                return JsonResponse({'error': 'Client slug already exists.'}, status=400)
            client.slug = slug
        if primary_color:
            client.primary_color = primary_color
        if is_active is not None:
            client.is_active = is_active.lower() in ('true', '1', 'yes')

        client.save()
        return JsonResponse({
            'success': True,
            'id': client.id,
            'name': client.name,
            'slug': client.slug,
            'primary_color': client.primary_color,
            'logo_url': client.logo.url if client.logo else None,
            'is_active': client.is_active,
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
def delete_client(request, pk):
    if request.method != 'DELETE':
        body_method = ''
        try:
            body = json.loads(request.body)
            body_method = body.get('_method', '')
        except Exception:
            pass
        if request.method == 'POST' and body_method.upper() == 'DELETE':
            pass
        else:
            return JsonResponse({'error': 'DELETE required'}, status=405)

    client = get_object_or_404(Client, pk=pk)
    try:
        client.delete()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


def download_external_image(product, image_url, side='image'):
    """
    Downloads an external image URL and saves it locally (e.g. to product.image)
    so it is served directly from the server disk, avoiding CORS & 403 hotlink blocks.
    """
    if not image_url or not str(image_url).strip().startswith('http'):
        return False
    try:
        field_obj = getattr(product, side, None)
        if field_obj and hasattr(field_obj, 'name') and field_obj.name:
            if field_obj.storage.exists(field_obj.name):
                return True
    except Exception:
        pass

    try:
        url = str(image_url).strip()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        }
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()

        content_type = resp.headers.get('Content-Type', '').lower()
        ext = '.jpg'
        if 'png' in content_type:
            ext = '.png'
        elif 'webp' in content_type:
            ext = '.webp'
        elif 'gif' in content_type:
            ext = '.gif'

        filename = f"product_{product.id}_{side}{ext}"
        field_obj = getattr(product, side, None)
        if field_obj is not None:
            field_obj.save(filename, ContentFile(resp.content), save=True)
            return True
    except Exception as e:
        logger.warning(f"Could not download external image for product {product.id} ({side}): {e}")
    return False


@csrf_exempt
def create_product(request):
    """API: Create a new product. Accepts multipart/form-data."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    try:
        name = request.POST.get('name', '').strip()
        shape_type = request.POST.get('shape_type', 'flat')
        client_slug = request.POST.get('client_slug', '').strip()
        if not name:
            return JsonResponse({'error': 'Product name is required'}, status=400)

        p = Product(name=name, shape_type=shape_type, is_active=True)
        if client_slug:
            client = Client.objects.filter(slug=client_slug, is_active=True).first()
            if client:
                p.client = client

        for field in ['external_product_url', 'external_product_id', 'tripo_job_id', 'tripo_model_url', 'tripo_status']:
            val = request.POST.get(field, '').strip()
            if val:
                setattr(p, field, val)

        # Handle image URLs (text fallbacks)
        for field in ['image_url', 'back_image_url', 'left_image_url', 'right_image_url', 'top_image_url']:
            val = request.POST.get(field, '').strip()
            if val:
                setattr(p, field, val)
        
        # Auto-scrape image from external_product_url if provided and image_url is not set
        external_url = request.POST.get('external_product_url', '').strip()
        if external_url and not request.POST.get('image_url', '').strip():
            import re
            from urllib.parse import urljoin, urlparse
            import logging
            logger = logging.getLogger(__name__)
            
            # Check if it's a direct image URL
            image_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']
            if any(external_url.lower().endswith(ext) for ext in image_extensions):
                logger.info(f"external_product_url is a direct image URL, storing in image_url: {external_url}")
                p.image_url = external_url
            else:
                # Try to scrape the storefront URL
                try:
                    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
                    resp = requests.get(external_url, headers=headers, timeout=15, allow_redirects=True)
                    resp.raise_for_status()
                    
                    base_url = resp.url
                    scraped_img_url = None
                    
                    def resolve_url(url):
                        if url.startswith('http'):
                            return url
                        return urljoin(base_url, url)
                    
                    def clean_url(url):
                        parsed = urlparse(url)
                        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                    
                    # Try meta tags
                    patterns = [
                        r'<meta[^>]*property=[\'"]og:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                        r'<meta[^>]*name=[\'"]twitter:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                        r'<meta[^>]*property=[\'"]product:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                        r'<meta[^>]*name=[\'"]image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                        r'<link[^>]*rel=[\'"]image_src[\'"][^>]*href=[\'"]([^\'"]+)[\'"]',
                    ]
                    
                    for pattern in patterns:
                        match = re.search(pattern, resp.text, re.IGNORECASE)
                        if match:
                            scraped_img_url = resolve_url(match.group(1))
                            break
                    
                    # Try img tags if no meta tags found
                    if not scraped_img_url:
                        img_patterns = [
                            r'<img[^>]*class=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
                            r'<img[^>]*id=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
                        ]
                        
                        for pattern in img_patterns:
                            match = re.search(pattern, resp.text, re.IGNORECASE)
                            if match:
                                scraped_img_url = resolve_url(match.group(1))
                                break
                        
                        # Fallback to first reasonable image
                        if not scraped_img_url:
                            all_imgs = re.findall(r'<img[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', resp.text, re.IGNORECASE)
                            for img_src in all_imgs:
                                if not any(skip in img_src.lower() for skip in ['icon', 'logo', 'favicon', 'sprite', 'badge', 'banner']):
                                    if any(ext in img_src.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                                        scraped_img_url = resolve_url(img_src)
                                        break
                    
                    if scraped_img_url:
                        scraped_img_url = clean_url(scraped_img_url)
                        p.image_url = scraped_img_url
                        logger.info(f"Auto-scraped and stored image URL: {scraped_img_url}")
                    else:
                        logger.warning(f"Could not scrape image from {external_url}")
                        
                except Exception as e:
                    logger.warning(f"Failed to scrape image from external_product_url: {e}")
                    # Don't fail the product creation if scraping fails

        p.save()

        # Handle file uploads after initial save so pk exists
        file_map = {
            'image': 'image',
            'back_image': 'back_image',
            'left_image': 'left_image',
            'right_image': 'right_image',
            'top_image': 'top_image',
            'model_3d': 'model_3d',
        }
        updated = False
        for form_field, model_field in file_map.items():
            f = request.FILES.get(form_field)
            if f:
                setattr(p, model_field, f)
                updated = True
        if updated:
            p.save()

        # Auto-download external HTTP image URLs locally to prevent CORS/403 hotlinking issues
        side_urls = {
            'image': p.image_url,
            'back_image': p.back_image_url,
            'left_image': p.left_image_url,
            'right_image': p.right_image_url,
            'top_image': p.top_image_url,
        }
        for side, url_val in side_urls.items():
            if url_val and url_val.startswith('http') and not getattr(p, side):
                download_external_image(p, url_val, side)

        return JsonResponse({
            'success': True,
            'id': p.id,
            'name': p.name,
            'shape_type': p.shape_type,
            'image_url': p.get_image_url,
            'back_image_url': p.get_back_image_url,
            'left_image_url': p.get_left_image_url,
            'right_image_url': p.get_right_image_url,
            'top_image_url': p.get_top_image_url,
            'model_3d_url': p.get_model_3d_url,
            'external_product_url': p.external_product_url,
            'image_scraped': bool(p.image_url and external_url),  # Indicate if image was scraped
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
def update_product(request, pk):
    """API: Update an existing product by pk. Accepts multipart/form-data."""
    if request.method not in ('POST', 'PUT', 'PATCH'):
        return JsonResponse({'error': 'POST/PUT required'}, status=405)
    try:
        p = get_object_or_404(Product, pk=pk)

        name = request.POST.get('name', '').strip()
        if name:
            p.name = name
        shape_type = request.POST.get('shape_type', '').strip()
        if shape_type:
            p.shape_type = shape_type
        client_slug = request.POST.get('client_slug', '').strip()
        if client_slug:
            client = Client.objects.filter(slug=client_slug, is_active=True).first()
            if client:
                p.client = client
        is_active = request.POST.get('is_active')
        if is_active is not None:
            p.is_active = is_active.lower() in ('true', '1', 'yes')

        for field in ['external_product_url', 'external_product_id', 'tripo_job_id', 'tripo_model_url', 'tripo_status']:
            val = request.POST.get(field, '').strip()
            if val:
                setattr(p, field, val)

        for field in ['image_url', 'back_image_url', 'left_image_url', 'right_image_url', 'top_image_url']:
            val = request.POST.get(field, '')
            if val.strip():
                setattr(p, field, val.strip())
        
        # Auto-scrape image from external_product_url if provided and image_url is not set
        external_url = request.POST.get('external_product_url', '').strip()
        if external_url and not request.POST.get('image_url', '').strip():
            import re
            from urllib.parse import urljoin, urlparse
            import logging
            logger = logging.getLogger(__name__)
            
            # Check if it's a direct image URL
            image_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']
            if any(external_url.lower().endswith(ext) for ext in image_extensions):
                logger.info(f"external_product_url is a direct image URL, storing in image_url: {external_url}")
                p.image_url = external_url
            else:
                # Try to scrape the storefront URL
                try:
                    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
                    resp = requests.get(external_url, headers=headers, timeout=15, allow_redirects=True)
                    resp.raise_for_status()
                    
                    base_url = resp.url
                    scraped_img_url = None
                    
                    def resolve_url(url):
                        if url.startswith('http'):
                            return url
                        return urljoin(base_url, url)
                    
                    def clean_url(url):
                        parsed = urlparse(url)
                        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                    
                    # Try meta tags
                    patterns = [
                        r'<meta[^>]*property=[\'"]og:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                        r'<meta[^>]*name=[\'"]twitter:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                        r'<meta[^>]*property=[\'"]product:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                        r'<meta[^>]*name=[\'"]image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                        r'<link[^>]*rel=[\'"]image_src[\'"][^>]*href=[\'"]([^\'"]+)[\'"]',
                    ]
                    
                    for pattern in patterns:
                        match = re.search(pattern, resp.text, re.IGNORECASE)
                        if match:
                            scraped_img_url = resolve_url(match.group(1))
                            break
                    
                    # Try img tags if no meta tags found
                    if not scraped_img_url:
                        img_patterns = [
                            r'<img[^>]*class=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
                            r'<img[^>]*id=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
                        ]
                        
                        for pattern in img_patterns:
                            match = re.search(pattern, resp.text, re.IGNORECASE)
                            if match:
                                scraped_img_url = resolve_url(match.group(1))
                                break
                        
                        # Fallback to first reasonable image
                        if not scraped_img_url:
                            all_imgs = re.findall(r'<img[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', resp.text, re.IGNORECASE)
                            for img_src in all_imgs:
                                if not any(skip in img_src.lower() for skip in ['icon', 'logo', 'favicon', 'sprite', 'badge', 'banner']):
                                    if any(ext in img_src.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                                        scraped_img_url = resolve_url(img_src)
                                        break
                    
                    if scraped_img_url:
                        scraped_img_url = clean_url(scraped_img_url)
                        p.image_url = scraped_img_url
                        logger.info(f"Auto-scraped and stored image URL: {scraped_img_url}")
                    else:
                        logger.warning(f"Could not scrape image from {external_url}")
                        
                except Exception as e:
                    logger.warning(f"Failed to scrape image from external_product_url: {e}")
                    # Don't fail the product update if scraping fails

        p.save()

        # Clear image fields when frontend signals removal
        SIDE_CLEAR_MAP = {
            'front': ('image', 'image_url'),
            'back':  ('back_image', 'back_image_url'),
            'left':  ('left_image', 'left_image_url'),
            'right': ('right_image', 'right_image_url'),
            'top':   ('top_image', 'top_image_url'),
        }
        cleared = False
        for side, (file_field, url_field) in SIDE_CLEAR_MAP.items():
            if request.POST.get(f'clear_{side}_image') == '1':
                setattr(p, file_field, None)
                setattr(p, url_field, '')
                cleared = True
        if cleared:
            p.save()

        file_map = {
            'image': 'image',
            'back_image': 'back_image',
            'left_image': 'left_image',
            'right_image': 'right_image',
            'top_image': 'top_image',
            'model_3d': 'model_3d',
        }
        updated = False
        for form_field, model_field in file_map.items():
            f = request.FILES.get(form_field)
            if f:
                setattr(p, model_field, f)
                updated = True
        if updated:
            p.save()

        # Auto-download external HTTP image URLs locally to prevent CORS/403 hotlinking issues
        side_urls = {
            'image': p.image_url,
            'back_image': p.back_image_url,
            'left_image': p.left_image_url,
            'right_image': p.right_image_url,
            'top_image': p.top_image_url,
        }
        for side, url_val in side_urls.items():
            if url_val and url_val.startswith('http') and not getattr(p, side):
                download_external_image(p, url_val, side)

        return JsonResponse({
            'success': True,
            'id': p.id,
            'name': p.name,
            'shape_type': p.shape_type,
            'client_slug': p.client.slug if p.client else None,
            'external_product_url': p.external_product_url or None,
            'external_product_id': p.external_product_id or None,
            'tripo_job_id': p.tripo_job_id or None,
            'tripo_model_url': p.tripo_model_url or None,
            'tripo_status': p.tripo_status or None,
            'embed_token': p.embed_token,
            'image_url': p.get_image_url,
            'back_image_url': p.get_back_image_url,
            'left_image_url': p.get_left_image_url,
            'right_image_url': p.get_right_image_url,
            'top_image_url': p.get_top_image_url,
            'model_3d_url': p.get_model_3d_url,
            'image_scraped': bool(p.image_url and request.POST.get('external_product_url', '').strip()),
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
def delete_product(request, pk):
    """API: Delete a product by pk."""
    if request.method != 'DELETE':
        # Allow a POST with _method=DELETE for simplicity
        body_method = ''
        try:
            body = json.loads(request.body)
            body_method = body.get('_method', '')
        except Exception:
            pass
        if request.method == 'POST' and body_method.upper() == 'DELETE':
            pass
        else:
            return JsonResponse({'error': 'DELETE required'}, status=405)
    try:
        p = get_object_or_404(Product, pk=pk)
        p.delete()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

@require_GET
def debug_tripo_balance(request):
    """
    Debug endpoint to check Tripo API key and balance
    """
    try:
        from customizer.services.tripo import TripoService
        from django.conf import settings
        import os
        
        # Show what API key is being used
        env_key = os.environ.get('TRIPO_API_KEY', 'Not found in env')
        settings_key = getattr(settings, 'TRIPO_API_KEY', 'Not found in settings')
        
        return JsonResponse({
            'success': True,
            'debug_info': {
                'env_api_key': env_key[:8] + '...' + env_key[-4:] if len(env_key) > 12 else env_key,
                'settings_api_key': settings_key[:8] + '...' + settings_key[-4:] if len(settings_key) > 12 else settings_key,
                'keys_match': env_key == settings_key
            },
            'balance': TripoService.check_balance()
        })
    except Exception as e:
        return JsonResponse({
            'error': str(e),
            'debug_info': 'Failed to check Tripo balance'
        }, status=500)

@csrf_exempt
@require_POST
def reset_tripo_status(request, pk):
    """
    Reset the Tripo status for a product (useful for stuck pending states)
    """
    try:
        p = get_object_or_404(Product, pk=pk)
        p.tripo_status = ''
        p.tripo_job_id = ''
        p.tripo_model_url = ''
        p.save()
        return JsonResponse({'success': True, 'message': 'Tripo status reset successfully'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_POST
def generate_product_3d(request, pk):
    """
    Trigger Tripo 3D generation from the product's primary image.
    Starts the async job and returns the job ID.
    """
    try:
        from customizer.services.tripo import TripoService
        p = get_object_or_404(Product, pk=pk)
        
        # Get texture quality from request (default: standard)
        texture_quality = request.POST.get('texture_quality', 'standard')
        
        # We need an image to generate from. Priority: image, then image_url, then scrape external_product_url
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"Product {p.id} - has image: {bool(p.image)}, has image_url: {bool(p.image_url)}, image_url value: {p.image_url}")
        logger.info(f"Using texture quality: {texture_quality}")
        
        if p.image:
            # TripoService needs an absolute path or accessible URL.
            # Local dev URLs won't work for Tripo, so we use upload_file for local files.
            logger.info(f"Using local file from p.image: {p.image.path}")
            file_path = p.image.path
            try:
                task_id = TripoService.generate_from_local_file(file_path, texture_quality=texture_quality)
            except Exception as e:
                logger.error(f"Tripo API call failed for local file: {e}")
                import traceback
                return JsonResponse({
                    'error': f'Tripo API error: {str(e)}',
                    'debug_info': {
                        'traceback': traceback.format_exc(),
                        'file_path': file_path,
                        'note': 'Failed to generate 3D model from local file'
                    }
                }, status=400)
        elif p.image_url:
            # Check if image_url is accessible (not localhost)
            logger.info(f"Using image_url: {p.image_url}")
            
            if 'localhost' in p.image_url or '127.0.0.1' in p.image_url:
                # Download the localhost image to a temp file first
                logger.info(f"Detected localhost URL, downloading image locally: {p.image_url}")
                import tempfile
                import os
                from urllib.parse import urlparse
                
                # Download the image
                try:
                    response = requests.get(p.image_url, timeout=15)
                    response.raise_for_status()
                except requests.exceptions.RequestException as e:
                    # Network/download error when trying to access localhost
                    logger.error(f"Failed to download localhost image: {e}")
                    import traceback
                    return JsonResponse({
                        'error': f'Failed to download image from localhost URL: {str(e)}',
                        'debug_info': {
                            'traceback': traceback.format_exc(),
                            'image_url': p.image_url
                        }
                    }, status=400)
                
                # Determine file extension from URL
                parsed_url = urlparse(p.image_url)
                ext = os.path.splitext(parsed_url.path)[1] or '.jpg'
                
                # Save to temp file
                with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
                    temp_file.write(response.content)
                    temp_path = temp_file.name
                
                logger.info(f"Downloaded localhost image to temp file: {temp_path}")
                
                try:
                    task_id = TripoService.generate_from_local_file(temp_path, texture_quality=texture_quality)
                except Exception as e:
                    # Tripo API error (likely insufficient credits)
                    logger.error(f"Tripo API call failed after downloading localhost image: {e}")
                    import traceback
                    return JsonResponse({
                        'error': f'Tripo API error: {str(e)}',
                        'debug_info': {
                            'traceback': traceback.format_exc(),
                            'image_url': p.image_url,
                            'note': 'Image was successfully downloaded from localhost, but Tripo API call failed'
                        }
                    }, status=400)
                finally:
                    # Clean up temp file
                    if os.path.exists(temp_path):
                        os.unlink(temp_path)
            else:
                # Assumes the image_url is public
                logger.info(f"Using public URL method for: {p.image_url}")
                try:
                    task_id = TripoService.generate_from_image(p.image_url, texture_quality=texture_quality)
                except Exception as e:
                    logger.error(f"Tripo API call failed for public URL: {e}")
                    import traceback
                    return JsonResponse({
                        'error': f'Tripo API error: {str(e)}',
                        'debug_info': {
                            'traceback': traceback.format_exc(),
                            'image_url': p.image_url,
                            'note': 'Failed to generate 3D model from public URL'
                        }
                    }, status=400)
        elif p.external_product_url:
            import logging
            logger = logging.getLogger(__name__)
            
            # Check if external_product_url is actually a direct image URL
            image_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']
            if any(p.external_product_url.lower().endswith(ext) for ext in image_extensions):
                # It's a direct image URL, store it in image_url and use it
                logger.info(f"external_product_url appears to be a direct image URL, storing it in image_url: {p.external_product_url}")
                p.image_url = p.external_product_url
                p.save()
                try:
                    task_id = TripoService.generate_from_image(p.image_url, texture_quality=texture_quality)
                except Exception as e:
                    logger.error(f"Tripo API call failed for external product URL (direct image): {e}")
                    import traceback
                    return JsonResponse({
                        'error': f'Tripo API error: {str(e)}',
                        'debug_info': {
                            'traceback': traceback.format_exc(),
                            'external_product_url': p.external_product_url,
                            'note': 'Failed to generate 3D model from external product URL (direct image)'
                        }
                    }, status=400)
            else:
                # It's a storefront URL, scrape it for images
                import re
                from urllib.parse import urljoin, urlparse
                
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
                
                # Allow redirects and follow them
                resp = requests.get(p.external_product_url, headers=headers, timeout=15, allow_redirects=True)
                resp.raise_for_status()
                
                # Use the final URL after redirects as the base
                base_url = resp.url
                logger.info(f"Scraping image from: {base_url}")
                
                scraped_img_url = None
                
                # Helper to resolve relative URLs
                def resolve_url(url):
                    if url.startswith('http'):
                        return url
                    return urljoin(base_url, url)
                
                # Helper to clean URLs (remove query params, fragments)
                def clean_url(url):
                    parsed = urlparse(url)
                    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                
                # Try multiple meta tag patterns (case insensitive)
                patterns = [
                    r'<meta[^>]*property=[\'"]og:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                    r'<meta[^>]*name=[\'"]twitter:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                    r'<meta[^>]*property=[\'"]product:image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                    r'<meta[^>]*name=[\'"]image[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                    r'<link[^>]*rel=[\'"]image_src[\'"][^>]*href=[\'"]([^\'"]+)[\'"]',
                    r'<meta[^>]*property=[\'"]og:image:url[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                    r'<meta[^>]*property=[\'"]og:image:secure_url[\'"][^>]*content=[\'"]([^\'"]+)[\'"]',
                ]
                
                for pattern in patterns:
                    match = re.search(pattern, resp.text, re.IGNORECASE)
                    if match:
                        scraped_img_url = resolve_url(match.group(1))
                        logger.info(f"Found image via meta tag pattern: {pattern[:30]}... -> {scraped_img_url}")
                        break
                
                # If no meta tags found, try to find the main product image in img tags
                if not scraped_img_url:
                    # Look for img tags with common product-related classes/ids
                    img_patterns = [
                        r'<img[^>]*class=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
                        r'<img[^>]*id=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
                        r'<img[^>]*alt=[\'"][^\'"]*(?:product|main|primary)[^\'"]*[\'"][^>]*src=[\'"]([^\'"]+)[\'"]',
                        r'<img[^>]*src=[\'"]([^\'"]+\.(?:jpg|jpeg|png|webp))[\'"][^>]*(?:class=[\'"][^\'"]*(?:product|main|primary|featured|hero)[^\'"]*[\'"])?',
                    ]
                    
                    for pattern in img_patterns:
                        match = re.search(pattern, resp.text, re.IGNORECASE)
                        if match:
                            scraped_img_url = resolve_url(match.group(1))
                            logger.info(f"Found image via img tag pattern: {pattern[:30]}... -> {scraped_img_url}")
                            break
                    
                    # Last resort: get the first reasonably sized img tag (avoid tiny icons)
                    if not scraped_img_url:
                        all_imgs = re.findall(r'<img[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', resp.text, re.IGNORECASE)
                        for img_src in all_imgs:
                            # Skip very small images (likely icons, logos, etc.)
                            if any(skip in img_src.lower() for skip in ['icon', 'logo', 'favicon', 'sprite', 'badge', 'banner']):
                                continue
                            # Prefer larger image formats
                            if any(ext in img_src.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                                scraped_img_url = resolve_url(img_src)
                                logger.info(f"Found image via fallback: {scraped_img_url}")
                                break
                
                if not scraped_img_url:
                    logger.error(f"Could not find any suitable image on {base_url}")
                    # Fallback: try to use image_url if available
                    if p.image_url:
                        logger.info(f"Falling back to existing image_url: {p.image_url}")
                        try:
                            task_id = TripoService.generate_from_image(p.image_url, texture_quality=texture_quality)
                        except Exception as e:
                            logger.error(f"Tripo API call failed for fallback image_url: {e}")
                            import traceback
                            return JsonResponse({
                                'error': f'Tripo API error: {str(e)}',
                                'debug_info': {
                                    'traceback': traceback.format_exc(),
                                    'fallback_image_url': p.image_url,
                                    'external_product_url': p.external_product_url,
                                    'note': 'Failed to generate 3D model from fallback image URL'
                                }
                            }, status=400)
                    else:
                        # Count how many images we found for debugging
                        all_imgs = re.findall(r'<img[^>]*src=[\'"]([^\'"]+)[\'"][^>]*>', resp.text, re.IGNORECASE)
                        logger.info(f"Found {len(all_imgs)} img tags on the page")
                        
                        return JsonResponse({
                            'error': 'Could not find a product image on the provided storefront URL. Please upload an image directly or provide a URL with proper meta tags.',
                            'suggestion': 'Try uploading the product image directly instead of using a storefront URL.',
                            'debug_info': {
                                'url_scraped': base_url,
                                'total_images_found': len(all_imgs),
                                'has_image_url': bool(p.image_url),
                                'has_uploaded_image': bool(p.image)
                            }
                        }, status=400)
                else:
                    # Clean and validate the URL
                    scraped_img_url = clean_url(scraped_img_url)
                    logger.info(f"Final scraped image URL: {scraped_img_url}")
                    
                    # Store the scraped URL in the database for future use
                    p.image_url = scraped_img_url
                    p.save()
                    logger.info(f"Stored scraped image URL in database for product {p.id}")
                    
                    try:
                        task_id = TripoService.generate_from_image(p.image_url, texture_quality=texture_quality)
                    except Exception as e:
                        logger.error(f"Tripo API call failed for scraped image: {e}")
                        import traceback
                        return JsonResponse({
                            'error': f'Tripo API error: {str(e)}',
                            'debug_info': {
                                'traceback': traceback.format_exc(),
                                'scraped_image_url': scraped_img_url,
                                'external_product_url': p.external_product_url,
                                'note': 'Failed to generate 3D model from scraped image'
                            }
                        }, status=400)
        else:
            return JsonResponse({'error': 'Product has no image or storefront URL to generate from.'}, status=400)
            
        p.tripo_job_id = task_id
        p.tripo_status = 'pending'
        p.tripo_model_url = None  # Clear previous model URL if any
        p.save()
        
        return JsonResponse({'success': True, 'task_id': task_id, 'status': 'pending'})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_POST
def create_tripo_model(request):
    try:
        data = json.loads(request.body)

        response = requests.post(
            "https://openapi.tripo3d.ai/v3/generation/text-to-model",
            headers={
                "Authorization": f"Bearer {settings.TRIPO_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "prompt": data.get("prompt"),
                "model": "v3.1-20260211",
            },
            timeout=30,
        )

        return JsonResponse(response.json(), safe=False)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def image_to_3d(request):
    """
    API: Convert an uploaded image to 3D model using Tripo.ai
    Accepts multipart/form-data with an image file
    Returns task_id for async processing
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    try:
        if 'image' not in request.FILES:
            return JsonResponse({'error': 'No image file provided'}, status=400)
        
        image_file = request.FILES['image']
        
        # Get optional parameters from form data
        model_version = request.POST.get('model_version', 'v3.1-20260211')
        texture_quality = request.POST.get('texture_quality', 'standard')
        face_limit = request.POST.get('face_limit')
        
        # Build kwargs for Tripo service
        kwargs = {
            'texture_quality': texture_quality,
        }
        
        if face_limit:
            try:
                kwargs['face_limit'] = int(face_limit)
            except ValueError:
                return JsonResponse({'error': 'Invalid face_limit value'}, status=400)
        
        # Save uploaded file temporarily
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_file:
            for chunk in image_file.chunks():
                temp_file.write(chunk)
            temp_path = temp_file.name
        
        try:
            from customizer.services.tripo import TripoService
            task_id = TripoService.generate_from_local_file(temp_path, model_version=model_version, texture_quality=texture_quality, face_limit=face_limit)
            
            return JsonResponse({
                'success': True,
                'task_id': task_id,
                'status': 'pending',
                'message': '3D generation started successfully'
            })
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def get_tripo_task_status(request, task_id):
    """
    API: Check the status of a Tripo 3D generation task
    Returns task status, progress, and model URL if complete
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'GET required'}, status=405)
    
    try:
        from customizer.services.tripo import TripoService
        result = TripoService.get_task_status(task_id)
        
        return JsonResponse({
            'success': True,
            'task_id': task_id,
            'status': result.get('status'),
            'progress': result.get('progress', 0),
            'model_url': result.get('model_url'),
            'rendered_image_url': result.get('rendered_image_url')
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_POST
def complete_tripo_generation(request):
    """
    API: Download and store the generated 3D model from Tripo
    This should be called when the task status is 'success'
    Downloads both the model_url and rendered_image_url (preview thumbnail)
    """
    try:
        from customizer.services.tripo import TripoService
        import os
        from django.core.files import File
        import logging
        logger = logging.getLogger(__name__)
        
        data = json.loads(request.body)
        task_id = data.get('task_id')
        product_id = data.get('product_id')
        
        if not task_id or not product_id:
            return JsonResponse({'error': 'task_id and product_id are required'}, status=400)
        
        # Get the task status to retrieve the model URL and rendered image URL
        result = TripoService.get_task_status(task_id)
        
        if result.get('status') != 'success':
            return JsonResponse({'error': 'Task is not completed yet'}, status=400)
        
        model_url = result.get('model_url')
        if not model_url:
            return JsonResponse({'error': 'No model URL available'}, status=400)
        
        rendered_image_url = result.get('rendered_image_url')
        
        # Get the product
        product = get_object_or_404(Product, pk=product_id)
        
        # Download the model file with retry logic
        logger.info(f"Downloading 3D model from Tripo: {model_url}")
        max_retries = 3
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                model_response = requests.get(model_url, timeout=30)
                model_response.raise_for_status()
                break
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    logger.warning(f"Download attempt {attempt + 1} failed, retrying in {retry_delay}s: {e}")
                    time.sleep(retry_delay)
                    retry_delay *= 2
                else:
                    raise Exception(f"Failed to download model after {max_retries} attempts: {e}")
        
        # Create a temporary file and save the downloaded model content
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.glb') as temp_file:
            temp_file.write(model_response.content)
            model_temp_path = temp_file.name
        
        try:
            # Save the model file to the product's model_3d field
            with open(model_temp_path, 'rb') as f:
                product.model_3d.save(f'{product.name.replace(" ", "_")}_3d.glb', File(f), save=False)
            
            logger.info(f"Model downloaded successfully, size: {len(model_response.content)} bytes")
            
            # Download and save the rendered image (preview thumbnail) if available
            if rendered_image_url:
                logger.info(f"Downloading preview image from Tripo: {rendered_image_url}")
                try:
                    # Download with retry logic
                    max_retries = 3
                    retry_delay = 2
                    image_response = None
                    
                    for attempt in range(max_retries):
                        try:
                            image_response = requests.get(rendered_image_url, timeout=30)
                            image_response.raise_for_status()
                            break
                        except requests.exceptions.RequestException as e:
                            if attempt < max_retries - 1:
                                logger.warning(f"Image download attempt {attempt + 1} failed, retrying in {retry_delay}s: {e}")
                                time.sleep(retry_delay)
                                retry_delay *= 2
                            else:
                                raise Exception(f"Failed to download preview image after {max_retries} attempts: {e}")
                    
                    if image_response:
                        # Determine file extension from URL or default to .png
                        from urllib.parse import urlparse
                        parsed_url = urlparse(rendered_image_url)
                        ext = os.path.splitext(parsed_url.path)[1] or '.png'
                        
                        # Create temporary file for the image
                        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_image_file:
                            temp_image_file.write(image_response.content)
                        image_temp_path = temp_image_file.name
                    
                        try:
                            # Save the image to the product's image field (or a dedicated preview field)
                            # Using the existing image field as a preview/thumbnail
                            with open(image_temp_path, 'rb') as img_f:
                                product.image.save(f'{product.name.replace(" ", "_")}_preview{ext}', File(img_f), save=False)
                            
                            logger.info(f"Preview image downloaded successfully, size: {len(image_response.content)} bytes")
                        finally:
                            # Clean up temporary image file
                            if os.path.exists(image_temp_path):
                                os.unlink(image_temp_path)
                except Exception as e:
                    # Log but don't fail if preview image download fails
                    logger.warning(f"Failed to download preview image: {e}")
            
            # Save the product with all the updated fields
            product.tripo_status = 'success'
            product.tripo_model_url = model_url  # Keep the original URL as reference
            product.save()
            
            return JsonResponse({
                'success': True,
                'model_url': product.get_model_3d_url,
                'preview_url': product.image.url if product.image else None,
                'message': '3D model downloaded and stored successfully'
            })
        finally:
            # Clean up temporary model file
            if os.path.exists(model_temp_path):
                os.unlink(model_temp_path)
                
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error completing Tripo generation: {e}")
        return JsonResponse({'error': str(e)}, status=500)
from django.http import HttpResponse
from PIL import Image
import io

@csrf_exempt
@require_POST
def convert_vector(request):
    """API: Convert EPS to PNG using Pillow (requires Ghostscript)."""
    if "file" not in request.FILES:
        return JsonResponse({"error": "No file uploaded"}, status=400)
    
    upload = request.FILES["file"]
    try:
        # Load EPS file. Pillow uses Ghostscript in the background.
        img = Image.open(upload)
        
        # Load the image to force Ghostscript conversion
        img.load()
        
        # Convert to RGBA for PNG
        if img.mode != "RGBA":
            img = img.convert("RGBA")
            
        # Save to memory buffer
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        
        return HttpResponse(buf.getvalue(), content_type="image/png")
    except Exception as e:
        return JsonResponse({"error": f"Vector conversion failed: {str(e)}"}, status=500)

@require_GET
def api_client_info(request, slug):
    '''API: Return public branding info for a client tenant.'''
    try:
        client = Client.objects.get(slug=slug, is_active=True)
        return JsonResponse({
            'name': client.name,
            'slug': client.slug,
            'primary_color': client.primary_color,
            'logo_url': client.logo.url if client.logo else None,
        })
    except Client.DoesNotExist:
        return JsonResponse({'error': 'Client not found'}, status=404)


@csrf_exempt
def create_design_submission(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        data = json.loads(request.body)
        client_slug = data.get('clientSlug')
        product_id = data.get('productId')

        client = Client.objects.filter(slug=client_slug, is_active=True).first() if client_slug else None
        product = Product.objects.filter(pk=product_id, is_active=True).first() if product_id else None

        submission = DesignSubmission.objects.create(
            client=client,
            product=product,
            product_name=data.get('productName', '') or (product.name if product else ''),
            design_preview_url=data.get('designPreviewUrl'),
            pdf_spec_sheet_url=data.get('pdfSpecSheetDataUrl'),
            color_name=data.get('configuration', {}).get('colorName'),
            color_hex=data.get('configuration', {}).get('colorHex'),
            imprint_method=data.get('configuration', {}).get('imprintMethod'),
            imprint_color=data.get('configuration', {}).get('imprintColor'),
            pms_number=data.get('configuration', {}).get('pmsNumber'),
            quantity=data.get('configuration', {}).get('quantity', 1),
            raw_payload=data,
        )

        return JsonResponse({'success': True, 'id': submission.id})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@require_GET
def list_product_submissions(request, pk):
    """Admin: List all design submissions for a given product."""
    submissions = DesignSubmission.objects.filter(product_id=pk).order_by('-created_at')
    data = []
    for s in submissions:
        data.append({
            'id': s.id,
            'product_name': s.product_name,
            'client': s.client.slug if s.client else None,
            'color_name': s.color_name,
            'color_hex': s.color_hex,
            'imprint_method': s.imprint_method,
            'quantity': s.quantity,
            'created_at': s.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'has_pdf': bool(s.pdf_spec_sheet_url),
            'has_preview': bool(s.design_preview_url),
            'preview_url': s.design_preview_url if s.design_preview_url and len(s.design_preview_url) < 500 else None,
        })
    return JsonResponse({'submissions': data})


@require_GET
def download_submission_pdf(request, pk):
    """Admin-only: Serve a stored base64 PDF data URL as a downloadable PDF file."""
    import base64
    submission = get_object_or_404(DesignSubmission, pk=pk)
    if not submission.pdf_spec_sheet_url:
        return JsonResponse({'error': 'No PDF available for this submission.'}, status=404)

    # Strip the data URL header: "data:application/pdf;base64,<data>"
    data_url = submission.pdf_spec_sheet_url
    if ',' in data_url:
        data_url = data_url.split(',', 1)[1]

    try:
        pdf_bytes = base64.b64decode(data_url)
    except Exception:
        return JsonResponse({'error': 'Invalid PDF data stored.'}, status=400)

    safe_name = submission.product_name.replace(' ', '_') or 'design'
    filename = f"{safe_name}_proof_{submission.created_at.strftime('%Y-%m-%d')}.pdf"

    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@require_GET
def product_embed_snippet(request, pk):
    """API: Return an HTML snippet for embedding a product."""
    product = get_object_or_404(Product, pk=pk)
    client_slug = product.client.slug if product.client else 'default'
    host = request.build_absolute_uri('/')[:-1] # remove trailing slash
    embed_url = f"{host}/embed/{client_slug}?embed_token={product.embed_token}"
    
    snippet = (
        f'<button onclick="window.open(\'{embed_url}\', \'3DDesigner\', \'width=1200,height=800,left=100,top=100\')" '
        f'style="padding: 10px 24px; background-color: #0d99ff; color: #ffffff; border: none; border-radius: 8px; '
        f'font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: background-color 0.2s;" '
        f'onmouseover="this.style.backgroundColor=\'#0b80d6\'" '
        f'onmouseout="this.style.backgroundColor=\'#0d99ff\'">'
        f'Customize in 3D'
        f'</button>'
    )
    return JsonResponse({'snippet': snippet, 'embed_url': embed_url})


import csv
from django.http import HttpResponse

@require_GET
def bulk_embed_export(request):
    """API: Export embed tokens as CSV. Optional ?client=slug filter."""
    products_qs = Product.objects.filter(is_active=True).select_related('client')
    client_slug = request.GET.get('client')
    if client_slug:
        products_qs = products_qs.filter(client__slug=client_slug)
    
    host = request.build_absolute_uri('/')[:-1]
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="embed_tokens.csv"'
    
    writer = csv.writer(response)
    writer.writerow(['Product Name', 'External Product ID', 'Embed Token', 'Embed URL'])
    
    for p in products_qs:
        c_slug = p.client.slug if p.client else 'default'
        embed_url = f"{host}/embed/{c_slug}?embed_token={p.embed_token}"
        writer.writerow([p.name, p.external_product_id or '', p.embed_token, embed_url])
        
    return response

