import random
import string
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from django.conf import settings
from django.contrib.auth.hashers import make_password

def generate_random_password(length=12):
    characters = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(random.choice(characters) for i in range(length))

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_me(request):
    """Return the currently authenticated user's profile info"""
    u = request.user
    client_slug = None
    client_name = None
    if not u.is_superuser:
        try:
            profile = getattr(u, 'profile', None)
            if profile and profile.client:
                client_slug = profile.client.slug
                client_name = profile.client.name
        except Exception:
            pass
            
    return JsonResponse({
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "is_superuser": u.is_superuser or (u.is_staff and not client_slug),
        "client_slug": client_slug,
        "client_name": client_name,
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_me(request):
    """Update profile and password"""
    u = request.user
    username = request.data.get('username', '').strip()
    email = request.data.get('email', '').strip()
    password = request.data.get('password', '')

    if username:
        if User.objects.filter(username=username).exclude(pk=u.pk).exists():
            return JsonResponse({'error': 'Username already taken'}, status=400)
        u.username = username
    
    if email:
        if User.objects.filter(email=email).exclude(pk=u.pk).exists():
            return JsonResponse({'error': 'Email already taken'}, status=400)
        u.email = email
        
    if password:
        u.set_password(password)

    u.save()
    return JsonResponse({"success": True})

@api_view(['GET'])
@permission_classes([IsAdminUser])
def get_members(request):
    """Return all staff members"""
    profile = getattr(request.user, 'profile', None)
    is_global_admin = request.user.is_superuser or (request.user.is_staff and (not profile or not profile.client))

    if not is_global_admin:
        if not profile or not profile.client:
            return JsonResponse({'error': 'Unauthorized'}, status=403)
        users = User.objects.filter(is_staff=True, profile__client=profile.client).exclude(pk=request.user.pk).select_related('profile__client')
    else:
        users = User.objects.filter(is_staff=True).exclude(pk=request.user.pk).select_related('profile__client')
    data = []
    for u in users:
        client_name = None
        if hasattr(u, 'profile') and u.profile.client:
            client_name = u.profile.client.name
            
        data.append({
            "id": u.id, 
            "username": u.username, 
            "email": u.email, 
            "is_superuser": u.is_superuser,
            "client_name": client_name
        })
    return JsonResponse(data, safe=False)

@api_view(['POST'])
@permission_classes([IsAdminUser])
def add_member(request):
    """Add a new staff member and email them the temporary password"""
    profile = getattr(request.user, 'profile', None)
    is_global_admin = request.user.is_superuser or (request.user.is_staff and (not profile or not profile.client))
    
    if not is_global_admin:
        if not profile or not profile.client:
            return JsonResponse({'error': 'Unauthorized'}, status=403)
    email = request.data.get('email', '').strip()
    username = request.data.get('username', '').strip()

    if not email or not username:
        return JsonResponse({'error': 'Email and Username are required'}, status=400)
    
    if User.objects.filter(username=username).exists():
        return JsonResponse({'error': 'Username already exists'}, status=400)
    if User.objects.filter(email=email).exists():
        return JsonResponse({'error': 'Email already exists'}, status=400)

    client_id = request.data.get('client_id')
    
    # If not a global admin, force the new user to belong to their client
    if not is_global_admin:
        client_id = profile.client.id
    
    # Generate temp password
    temp_password = generate_random_password()

    # Create the user
    user = User.objects.create_user(
        username=username,
        email=email,
        password=temp_password,
        is_staff=True  # They get staff access
    )
    
    # Set User Profile
    from .models import UserProfile, Client
    profile, _ = UserProfile.objects.get_or_create(user=user)
    if client_id:
        try:
            client = Client.objects.get(pk=client_id)
            profile.client = client
            profile.role = 'end_user' if not request.user.is_superuser else 'client_admin' 
            # Note: giving them end_user or client_admin doesn't matter too much currently as both allow staff access
            # But let's standardize to client_admin if created by client_admin for simplicity, since they are managing things.
            profile.role = 'client_admin'
            profile.save()
        except Client.DoesNotExist:
            pass

    # Prepare and send the welcome email
    subject = "Welcome to Neura 3D - Your Account Credentials"
    message = f"""Hello {username},

An administrator has invited you to the Neura 3D Customizer Dashboard.
Here are your temporary login details:

Username: {username}
Temporary Password: {temp_password}

Please log in and remember to keep this password secure.

Best regards,
The Neura 3D Team
"""
    try:
        if settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD:
            send_mail(
                subject,
                message,
                settings.EMAIL_HOST_USER,
                [email],
                fail_silently=False,
            )
            email_sent = True
        else:
            email_sent = False
            print("Skipped sending email because EMAIL_HOST_USER or PASSWORD is not set.")
    except Exception as e:
        print(f"Failed to send email: {e}")
        email_sent = False

    return JsonResponse({
        'success': True,
        'user': {"id": user.id, "username": user.username, "email": user.email},
        'email_sent': email_sent
    })

@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def delete_member(request, pk):
    """Delete a staff member"""
    profile = getattr(request.user, 'profile', None)
    is_global_admin = request.user.is_superuser or (request.user.is_staff and (not profile or not profile.client))
    
    try:
        user = User.objects.get(pk=pk, is_staff=True)
        if user.pk == request.user.pk:
            return JsonResponse({'error': 'Cannot delete your own account'}, status=400)
            
        is_target_global_admin = user.is_superuser or (user.is_staff and (not getattr(user, 'profile', None) or not user.profile.client))
        
        if is_target_global_admin and not is_global_admin:
            return JsonResponse({'error': 'Permission denied: Only global admins can remove other global admins.'}, status=403)
            
        if not is_global_admin:
            # Check client boundary
            req_profile = profile
            user_profile = getattr(user, 'profile', None)
            
            if not req_profile or not req_profile.client:
                return JsonResponse({'error': 'Unauthorized'}, status=403)
                
            if not user_profile or user_profile.client != req_profile.client:
                return JsonResponse({'error': 'Permission denied: Member belongs to a different client.'}, status=403)
            
        user.delete()
        return JsonResponse({'success': True})
    except User.DoesNotExist:
        return JsonResponse({'error': 'Member not found'}, status=404)
