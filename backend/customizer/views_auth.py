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
    return JsonResponse({
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "is_superuser": u.is_superuser
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
    users = User.objects.filter(is_staff=True).exclude(pk=request.user.pk)
    data = [
        {"id": u.id, "username": u.username, "email": u.email, "is_superuser": u.is_superuser}
        for u in users
    ]
    return JsonResponse(data, safe=False)

@api_view(['POST'])
@permission_classes([IsAdminUser])
def add_member(request):
    """Add a new staff member and email them the temporary password"""
    email = request.data.get('email', '').strip()
    username = request.data.get('username', '').strip()

    if not email or not username:
        return JsonResponse({'error': 'Email and Username are required'}, status=400)
    
    if User.objects.filter(username=username).exists():
        return JsonResponse({'error': 'Username already exists'}, status=400)
    if User.objects.filter(email=email).exists():
        return JsonResponse({'error': 'Email already exists'}, status=400)

    # Generate temp password
    temp_password = generate_random_password()

    # Create the user
    user = User.objects.create_user(
        username=username,
        email=email,
        password=temp_password,
        is_staff=True  # They get staff access
    )

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
    try:
        user = User.objects.get(pk=pk, is_staff=True)
        if user.pk == request.user.pk:
            return JsonResponse({'error': 'Cannot delete your own account'}, status=400)
            
        if user.is_superuser and not request.user.is_superuser:
            return JsonResponse({'error': 'Permission denied: Only superusers can remove other superusers.'}, status=403)
            
        user.delete()
        return JsonResponse({'success': True})
    except User.DoesNotExist:
        return JsonResponse({'error': 'Member not found'}, status=404)
