# from django.urls import path, include
# from django.conf import settings
# from django.conf.urls.static import static
# from customizer.views import create_tripo_model


# urlpatterns = [
#     path('', include('customizer.urls')),
# ]

# if settings.DEBUG:
#     urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


# urlpatterns += [
#     path("api/tripo/create/", create_tripo_model),
# ]






from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve
from customizer.views import create_tripo_model


urlpatterns = [
    path('', include('customizer.urls')),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    path("api/tripo/create/", create_tripo_model),
]