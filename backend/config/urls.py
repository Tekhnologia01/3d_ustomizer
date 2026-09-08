from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve
from customizer.views import create_tripo_model
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from customizer.views_auth import get_members, add_member, delete_member, get_me, update_me

urlpatterns = [
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/me/', get_me, name='get_me'),
    path('api/auth/me/update/', update_me, name='update_me'),
    path('api/members/', get_members, name='get_members'),
    path('api/members/add/', add_member, name='add_member'),
    path('api/members/<int:pk>/delete/', delete_member, name='delete_member'),
    path('', include('customizer.urls')),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    path("api/tripo/create/", create_tripo_model),
]