from django.urls import path
from . import views
from .jwt_auth import jwt_staff_required

app_name = 'customizer'

urlpatterns = [
    path('api/products/',             views.api_products,   name='api_products'),    # GET products list
    path('api/products/create/',      jwt_staff_required(views.create_product), name='create_product'),  # POST create product
    path('api/products/<int:pk>/update/', jwt_staff_required(views.update_product), name='update_product'), # POST update product
    path('api/products/<int:pk>/delete/', jwt_staff_required(views.delete_product), name='delete_product'), # DELETE product
    path('api/products/<int:pk>/generate-3d/', jwt_staff_required(views.generate_product_3d), name='generate_product_3d'), # POST generate 3D model
    path('api/products/<int:pk>/reset-tripo-status/', jwt_staff_required(views.reset_tripo_status), name='reset_tripo_status'), # POST reset tripo status
    path('api/products/<int:pk>/embed-snippet/', views.product_embed_snippet, name='product_embed_snippet'), # GET embed snippet
    path('api/products/bulk-embed-export/', jwt_staff_required(views.bulk_embed_export), name='bulk_embed_export'), # GET CSV export
    path('api/zones/<int:pk>/',       views.get_zones,      name='get_zones'),       # GET zones for a product
    path('api/save-zones/',           jwt_staff_required(views.save_zones),     name='save_zones'),      # POST save zones
    path('api/design-submissions/',   views.create_design_submission, name='create_design_submission'), # POST save shopper design submission
    path('api/design-submissions/<int:pk>/pdf/', jwt_staff_required(views.download_submission_pdf), name='download_submission_pdf'), # GET download PDF
    path('api/products/<int:pk>/submissions/', jwt_staff_required(views.list_product_submissions), name='list_product_submissions'), # GET list submissions for a product
    path('api/convert-vector/',       views.convert_vector,   name='convert_vector'),  # POST convert EPS to PNG
    path('api/clients/',              jwt_staff_required(views.api_clients),      name='api_clients'),     # GET list of clients
    path('api/clients/create/',       jwt_staff_required(views.create_client),     name='create_client'),  # POST create client
    path('api/clients/<int:pk>/update/', jwt_staff_required(views.update_client),   name='update_client'), # POST update client
    path('api/clients/<int:pk>/delete/', jwt_staff_required(views.delete_client),   name='delete_client'), # DELETE client
    path('api/client/<slug:slug>/',   views.api_client_info,  name='api_client_info'), # GET client branding info
    path('api/tripo/image-to-3d/',    views.image_to_3d,      name='image_to_3d'),     # POST convert image to 3D
    path('api/tripo/task-status/<str:task_id>/', views.get_tripo_task_status, name='get_tripo_task_status'), # GET Tripo task status
    path('api/tripo/complete-generation/', views.complete_tripo_generation, name='complete_tripo_generation'), # POST complete Tripo generation
    path('api/tripo/debug-balance/',  views.debug_tripo_balance, name='debug_tripo_balance'), # GET debug Tripo balance
]
