from functools import wraps
from django.http import JsonResponse
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed

def jwt_staff_required(view_func):
    """
    Decorator for standard Django views that checks for a valid SimpleJWT 
    and ensuring the user is_staff.
    """
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        authenticator = JWTAuthentication()
        try:
            auth_tuple = authenticator.authenticate(request)
        except AuthenticationFailed as e:
            return JsonResponse({'error': str(e)}, status=401)
        
        if auth_tuple is None:
            return JsonResponse({'error': 'Authentication credentials were not provided.'}, status=401)
            
        user, token = auth_tuple
        if not user.is_staff:
            return JsonResponse({'error': 'You do not have permission to perform this action.'}, status=403)
            
        request.user = user
        return view_func(request, *args, **kwargs)
    return _wrapped_view
