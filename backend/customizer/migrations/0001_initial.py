from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Product',
            fields=[
                ('id',        models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('name',      models.CharField(max_length=150)),
                ('image_url', models.URLField(help_text='Direct link to product image')),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='DesignZone',
            fields=[
                ('id',             models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('zone_type',      models.CharField(choices=[('logo','Logo Zone'),('text','Text Zone')], max_length=10)),
                ('x_percent',      models.FloatField(default=30.0)),
                ('y_percent',      models.FloatField(default=25.0)),
                ('width_percent',  models.FloatField(default=40.0)),
                ('height_percent', models.FloatField(default=40.0)),
                ('product',        models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='zones', to='customizer.product')),
            ],
            options={'ordering': ['zone_type']},
        ),
    ]
