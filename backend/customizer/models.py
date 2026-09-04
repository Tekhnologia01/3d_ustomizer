import secrets
from django.db import models
from django.contrib.auth.models import User
from django.utils.text import slugify

def generate_embed_token():
    return secrets.token_urlsafe(32)

class ImprintMethod(models.Model):
    """
    A printing/branding technique (e.g. Screen Print, Laser Engrave, Deboss).
    The visual_effect key is used by the 3D renderer to apply the correct texture effect.
    """
    EFFECT_CHOICES = [
        ('standard', 'Standard (Color Print)'),
        ('laser_engrave', 'Laser Engrave (Metallic Etch)'),
        ('deboss', 'Deboss / Emboss (Leather Stamp)'),
        ('full_color', 'Full Color Digital Print'),
        ('foil_stamp', 'Foil Stamp'),
    ]
    name = models.CharField(max_length=100, unique=True)
    visual_effect = models.CharField(max_length=30, choices=EFFECT_CHOICES, default='standard')
    supports_color = models.BooleanField(
        default=True,
        help_text='If False (e.g. Laser Engrave), the color picker is hidden in the UI.'
    )

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']


class Material(models.Model):
    """
    The physical material of a product (e.g. Stainless Steel, Faux Leather, Cotton).
    Each material pre-defines which imprint methods are compatible with it.
    """
    name = models.CharField(max_length=100, unique=True)
    compatible_methods = models.ManyToManyField(
        ImprintMethod,
        blank=True,
        help_text='Which imprint methods work on this material.'
    )

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']

class Client(models.Model):
    name = models.CharField(max_length=150)
    slug = models.SlugField(unique=True, blank=True)
    logo = models.ImageField(upload_to='clients/logos/', null=True, blank=True)
    primary_color = models.CharField(max_length=7, default='#6c63ff')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('super_admin', 'Super Admin'),
        ('client_admin', 'Client Admin'),
        ('end_user', 'End User'),
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='end_user')

    def __str__(self):
        return f"{self.user.username} - {self.get_role_display()}"


class Product(models.Model):
    """Product with an optional local image file or remote image URL for multiple sides."""
    SHAPE_CHOICES = [
        ('cylinder', 'Cylinder (Bottle, Mug)'),
        ('box', 'Box (Notebook, Case)'),
        ('flat', 'Flat Surface (Cover, Tee)'),
    ]
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='products', null=True, blank=True)
    name      = models.CharField(max_length=150)
    shape_type = models.CharField(max_length=150, choices=SHAPE_CHOICES, default='flat')
    model_3d = models.FileField(upload_to='models/', null=True, blank=True, help_text="Upload 3D model (.gltf or .glb) file")
    external_product_url = models.CharField(max_length=2000, null=True, blank=True, help_text='Original storefront product URL (e.g. Nike.com link).')
    external_product_id = models.CharField(max_length=255, null=True, blank=True, help_text='Marketplace or client product identifier.')
    embed_token = models.CharField(
        max_length=64, unique=True, blank=True, default=generate_embed_token,
        help_text='Auto-generated URL-safe token. Use this in iframe URLs: ?embed_token=<value>. Never needs to be set manually.'
    )
    tripo_job_id = models.CharField(max_length=255, null=True, blank=True, help_text='TripO generation job ID.')
    tripo_model_url = models.URLField(max_length=2000, null=True, blank=True, help_text='URL to the generated TripO model.')
    tripo_status = models.CharField(max_length=100, null=True, blank=True, help_text='TripO model generation status.')
    material = models.ForeignKey(
        'Material', on_delete=models.SET_NULL, null=True, blank=True,
        help_text='The physical material of this product (used to auto-suggest imprint methods).'
    )
    available_imprint_methods = models.ManyToManyField(
        'ImprintMethod', blank=True,
        help_text='Override: specific imprint methods available for this product. If empty, uses material defaults.'
    )

    # Front
    image     = models.ImageField(upload_to='products/', null=True, blank=True, help_text="Upload Front image file")
    image_url = models.CharField(max_length=1000, help_text="OR provide direct link to Front image", null=True, blank=True)

    # Back
    back_image     = models.ImageField(upload_to='products/', null=True, blank=True, help_text="Upload Back image file")
    back_image_url = models.CharField(max_length=1000, help_text="OR provide direct link to Back image", null=True, blank=True)

    # Left
    left_image     = models.ImageField(upload_to='products/', null=True, blank=True, help_text="Upload Left image file")
    left_image_url = models.CharField(max_length=1000, help_text="OR provide direct link to Left image", null=True, blank=True)

    # Right
    right_image     = models.ImageField(upload_to='products/', null=True, blank=True, help_text="Upload Right image file")
    right_image_url = models.CharField(max_length=1000, help_text="OR provide direct link to Right image", null=True, blank=True)

    # Top
    top_image     = models.ImageField(upload_to='products/', null=True, blank=True, help_text="Upload Top image file")
    top_image_url = models.CharField(max_length=1000, help_text="OR provide direct link to Top image", null=True, blank=True)

    is_active = models.BooleanField(default=True)

    @property
    def get_image_url(self):
        if self.image:
            try:
                if self.image.storage.exists(self.image.name):
                    return self.image.url
            except Exception:
                pass
        if self.image_url and self.image_url.strip():
            return self.image_url.strip()
        return None

    @property
    def get_back_image_url(self):
        if self.back_image:
            try:
                if self.back_image.storage.exists(self.back_image.name):
                    return self.back_image.url
            except Exception:
                pass
        if self.back_image_url and self.back_image_url.strip():
            return self.back_image_url.strip()
        return None

    @property
    def get_left_image_url(self):
        if self.left_image:
            try:
                if self.left_image.storage.exists(self.left_image.name):
                    return self.left_image.url
            except Exception:
                pass
        if self.left_image_url and self.left_image_url.strip():
            return self.left_image_url.strip()
        return None

    @property
    def get_right_image_url(self):
        if self.right_image:
            try:
                if self.right_image.storage.exists(self.right_image.name):
                    return self.right_image.url
            except Exception:
                pass
        if self.right_image_url and self.right_image_url.strip():
            return self.right_image_url.strip()
        return None

    @property
    def get_top_image_url(self):
        if self.top_image:
            try:
                if self.top_image.storage.exists(self.top_image.name):
                    return self.top_image.url
            except Exception:
                pass
        if self.top_image_url and self.top_image_url.strip():
            return self.top_image_url.strip()
        return None

    @property
    def get_model_3d_url(self):
        if self.model_3d:
            try:
                if self.model_3d.storage.exists(self.model_3d.name):
                    return self.model_3d.url
            except Exception:
                pass
        if self.tripo_model_url and self.tripo_model_url.strip():
            return self.tripo_model_url.strip()
        return None

    def save(self, *args, **kwargs):
        # Auto-generate a unique embed token so that the storefront can link
        # directly to this product without any manual configuration.
        if not self.embed_token:
            while True:
                token = secrets.token_urlsafe(32)
                if not Product.objects.filter(embed_token=token).exists():
                    self.embed_token = token
                    break
        # Save first so that the image file is actually processed and gets a URL
        super().save(*args, **kwargs)
        
        # If image file was uploaded and image_url is empty, set default fallback
        updated = False
        if self.image and not self.image_url:
            self.image_url = self.image.url
            updated = True
        if self.back_image and not self.back_image_url:
            self.back_image_url = self.back_image.url
            updated = True
        if self.left_image and not self.left_image_url:
            self.left_image_url = self.left_image.url
            updated = True
        if self.right_image and not self.right_image_url:
            self.right_image_url = self.right_image.url
            updated = True
        if self.top_image and not self.top_image_url:
            self.top_image_url = self.top_image.url
            updated = True

        if updated:
            super().save(update_fields=['image_url', 'back_image_url', 'left_image_url', 'right_image_url', 'top_image_url'])

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']



class DesignZone(models.Model):
    """
    A predefined zone on a product where content is placed.
    Coordinates stored as % of product image dimensions.
    """
    ZONE_TYPE = [
        ('logo', 'Logo Zone'),
        ('text', 'Text Zone'),
    ]
    product       = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='zones')
    side          = models.CharField(max_length=50, default='front')
    name          = models.CharField(max_length=50, blank=True, null=True, help_text="Optional custom name (e.g. 'Left Chest') to display as a view.")
    zone_type     = models.CharField(max_length=10, choices=ZONE_TYPE)
    x_percent     = models.FloatField(default=30.0)
    y_percent     = models.FloatField(default=25.0)
    width_percent = models.FloatField(default=40.0)
    height_percent= models.FloatField(default=40.0)
    angle         = models.FloatField(default=0.0)
    actual_width  = models.FloatField(default=12.0, help_text="Max actual width in inches/cm")
    actual_height = models.FloatField(default=12.0, help_text="Max actual height in inches/cm")
    source        = models.CharField(max_length=10, default='2d', help_text="Whether zone was created in 2D or 3D")
    point3d       = models.JSONField(null=True, blank=True, help_text="[x,y,z] hit point in 3D local space")
    normal3d      = models.JSONField(null=True, blank=True, help_text="[x,y,z] surface normal in 3D local space")
    size3d        = models.JSONField(null=True, blank=True, help_text="[w,h,d] decal bounds in 3D world space")

    def __str__(self):
        return f"{self.product.name} — {self.get_zone_type_display()}"

    class Meta:
        ordering = ['zone_type']


class DesignSubmission(models.Model):
    """A persisted shopper design submission for cart/order integration."""
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name='design_submissions')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name='design_submissions')
    product_name = models.CharField(max_length=255)
    design_preview_url = models.TextField(blank=True, null=True)
    pdf_spec_sheet_url = models.TextField(blank=True, null=True)
    color_name = models.CharField(max_length=100, blank=True, null=True)
    color_hex = models.CharField(max_length=7, blank=True, null=True)
    imprint_method = models.CharField(max_length=100, blank=True, null=True)
    imprint_color = models.CharField(max_length=100, blank=True, null=True)
    pms_number = models.CharField(max_length=100, blank=True, null=True)
    quantity = models.PositiveIntegerField(default=1)
    raw_payload = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.product_name} ({self.client.slug if self.client else 'no-client'})"

    class Meta:
        ordering = ['-created_at']
