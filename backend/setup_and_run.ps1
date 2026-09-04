Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Neura 3D — Full Setup & Run" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Set-Location "d:\Rahul\3D Logo on product"

# Step 1: Create venv if not exists
if (-Not (Test-Path "venv")) {
    Write-Host "[1/6] Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
} else {
    Write-Host "[1/6] Virtual environment already exists." -ForegroundColor Green
}

# Step 2: Activate venv
Write-Host "[2/6] Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

# Step 3: Install requirements
Write-Host "[3/6] Installing requirements..." -ForegroundColor Yellow
pip install -r requirements.txt

# Step 4: Create MySQL database if not exists
Write-Host "[4/6] Creating MySQL database 'product_customizer' if not exists..." -ForegroundColor Yellow
$mysqlCmd = @"
CREATE DATABASE IF NOT EXISTS product_customizer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
"@
$mysqlCmd | mysql -u root -proot 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "    Database ready." -ForegroundColor Green
} else {
    Write-Host "    WARNING: Could not auto-create DB. Make sure MySQL is running and password is 'root'." -ForegroundColor Red
    Write-Host "    Manually run: CREATE DATABASE product_customizer CHARACTER SET utf8mb4;" -ForegroundColor Red
}

# Step 5: Run migrations
Write-Host "[5/6] Running migrations..." -ForegroundColor Yellow
python manage.py makemigrations customizer
python manage.py migrate

# Step 6: Create superuser (non-interactive)
Write-Host "[6/6] Creating admin superuser (admin / admin123)..." -ForegroundColor Yellow
$createAdmin = @"
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.contrib.auth import get_user_model
U = get_user_model()
if not U.objects.filter(username='admin').exists():
    U.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print('Superuser created: admin / admin123')
else:
    print('Superuser already exists.')
"@
python -c $createAdmin

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  SUCCESS! Starting server..." -ForegroundColor Green
Write-Host "  App   -> http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "  Admin -> http://127.0.0.1:8000/admin" -ForegroundColor Green
Write-Host "  Login -> admin / admin123" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

python manage.py runserver
