from django.contrib import admin
from django.http import HttpResponse
from django.utils.html import format_html
from django.urls import reverse
import csv
from .models import Product, DesignZone, Client, UserProfile, ImprintMethod, Material, DesignSubmission


class DesignZoneInline(admin.TabularInline):
    model = DesignZone
    extra = 2
    fields = ['name', 'side', 'zone_type', 'x_percent', 'y_percent', 'width_percent', 'height_percent', 'angle']


class DesignSubmissionInline(admin.TabularInline):
    model = DesignSubmission
    extra = 0
    can_delete = False
    fields = ['client', 'product_name', 'imprint_method', 'quantity', 'created_at', 'download_pdf_link']
    readonly_fields = ['client', 'product_name', 'imprint_method', 'quantity', 'created_at', 'download_pdf_link']

    def has_add_permission(self, request, obj=None):
        return False


@admin.action(description="Export embed snippets as CSV")
def export_embed_snippets(modeladmin, request, queryset):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="embed_tokens.csv"'
    writer = csv.writer(response)
    writer.writerow(['Product Name', 'External Product ID', 'Embed Token', 'Iframe URL'])
    
    host = request.build_absolute_uri('/')[:-1]
    
    for p in queryset:
        c_slug = p.client.slug if p.client else 'default'
        iframe_url = f"{host}/embed/{c_slug}?embed_token={p.embed_token}"
        writer.writerow([p.name, p.external_product_id or '', p.embed_token, iframe_url])
    return response


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'shape_type', 'client', 'external_product_id', 'embed_token', 'tripo_status', 'is_active']
    list_editable = ['is_active']
    readonly_fields = ['embed_token']
    actions = [export_embed_snippets]
    inlines = [DesignZoneInline, DesignSubmissionInline]
    fieldsets = (
        (None, {
            'fields': ('client', 'name', 'shape_type', 'model_3d', 'is_active')
        }),
        ('Material & Imprint', {
            'fields': ('material', 'available_imprint_methods'),
            'description': 'Set the material to auto-assign compatible imprint methods, or override manually.'
        }),
        ('External storefront', {
            'fields': ('external_product_url', 'external_product_id', 'embed_token', 'tripo_job_id', 'tripo_model_url', 'tripo_status'),
            'description': 'Link this product to a client storefront item and record TripO model generation metadata.'
        }),
        ('Front Side', {
            'fields': ('image', 'image_url')
        }),
        ('Back Side', {
            'fields': ('back_image', 'back_image_url')
        }),
        ('Left Side', {
            'fields': ('left_image', 'left_image_url')
        }),
        ('Right Side', {
            'fields': ('right_image', 'right_image_url')
        }),
        ('Top Side', {
            'fields': ('top_image', 'top_image_url')
        }),
    )


@admin.register(DesignZone)
class DesignZoneAdmin(admin.ModelAdmin):
    list_display = ['product', 'name', 'side', 'zone_type', 'x_percent', 'y_percent', 'width_percent', 'height_percent', 'angle']
    list_filter = ['zone_type', 'side', 'product']

@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'is_active']
    prepopulated_fields = {'slug': ('name',)}

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'client', 'role']


@admin.register(ImprintMethod)
class ImprintMethodAdmin(admin.ModelAdmin):
    list_display = ['name', 'visual_effect', 'supports_color']
    list_editable = ['supports_color']


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ['name']
    filter_horizontal = ['compatible_methods']


@admin.register(DesignSubmission)
class DesignSubmissionAdmin(admin.ModelAdmin):
    list_display = ['product_name', 'client', 'imprint_method', 'quantity', 'created_at', 'download_pdf_link', 'preview_image']
    ordering = ['-created_at']
    list_filter = ['client', 'created_at']
    search_fields = ['product_name', 'color_name', 'imprint_method', 'pms_number']
    readonly_fields = ['raw_payload', 'design_preview_image', 'download_pdf_link', 'created_at']
    fieldsets = (
        (None, {
            'fields': ('client', 'product', 'product_name', 'quantity', 'color_name', 'color_hex', 'imprint_method', 'imprint_color', 'pms_number')
        }),
        ('Design Files', {
            'fields': ('design_preview_image', 'download_pdf_link', 'raw_payload'),
            'description': 'Design snapshot and downloadable PDF spec sheet submitted by the shopper.',
        }),
        ('Timestamps', {
            'fields': ('created_at',)
        }),
    )

    @admin.display(description='PDF Spec Sheet')
    def download_pdf_link(self, obj):
        if not obj.pdf_spec_sheet_url:
            return '—'
        url = reverse('customizer:download_submission_pdf', args=[obj.pk])
        return format_html(
            '<a href="{}" target="_blank" style="'
            'display:inline-block;padding:4px 10px;background:#1a73e8;'
            'color:#fff;border-radius:4px;font-size:12px;text-decoration:none;">'
            '⬇ Download PDF</a>',
            url
        )

    @admin.display(description='Design Preview')
    def preview_image(self, obj):
        if not obj.design_preview_url:
            return '—'
        return format_html(
            '<img src="{}" style="height:60px;border-radius:4px;border:1px solid #ddd;" />',
            obj.design_preview_url
        )

    @admin.display(description='Design Preview (Full)')
    def design_preview_image(self, obj):
        if not obj.design_preview_url:
            return '—'
        return format_html(
            '<img src="{}" style="max-width:400px;border-radius:6px;border:1px solid #ddd;" />',
            obj.design_preview_url
        )
