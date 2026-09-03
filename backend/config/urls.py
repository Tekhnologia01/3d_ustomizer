from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from customizer.views import create_tripo_model


urlpatterns = [
    path('', include('customizer.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


urlpatterns += [
    path("api/tripo/create/", create_tripo_model),
]