@echo off
echo ============================================
echo   CustomCraft — Product Customizer Setup
echo ============================================
echo.

echo [1/5] Creating virtual environment...
python -m venv venv
if errorlevel 1 (echo ERROR: Python not found. Install Python 3.10+ && pause && exit /b 1)

echo [2/5] Activating venv and installing dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt

echo [3/5] Running database migrations...
python manage.py migrate

echo [4/5] Seeding sample products (downloads images)...
python manage.py seed_products

echo [5/5] Creating admin superuser (admin / admin123)...
python -c "from django.contrib.auth import get_user_model; import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings'); django.setup(); U=get_user_model(); U.objects.filter(username='admin').exists() or U.objects.create_superuser('admin','admin@example.com','admin123')"

echo.
echo ============================================
echo   DONE! Starting server at http://127.0.0.1:8000
echo   Admin panel:  http://127.0.0.1:8000/admin
echo   Username: admin   Password: admin123
echo ============================================
echo.
python manage.py runserver
