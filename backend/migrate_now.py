"""
Run this script directly to set up the database.
Usage: python migrate_now.py
"""
import os
import sys
import subprocess

BASE = os.path.dirname(os.path.abspath(__file__))

def run(cmd):
    print(f"\n>>> {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=BASE)
    if result.returncode != 0:
        print(f"ERROR: Command failed with exit code {result.returncode}")
    return result.returncode

# Detect python executable (handles venv)
PYTHON = sys.executable
print(f"Using Python: {PYTHON}")

# 1. Install required packages
run([PYTHON, "-m", "pip", "install", "Django", "Pillow", "PyMySQL", "-q"])

# 2. makemigrations
run([PYTHON, "manage.py", "makemigrations", "customizer"])

# 3. migrate
run([PYTHON, "manage.py", "migrate"])

# 4. Create superuser
print("\n>>> Creating admin superuser (admin / admin123)...")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
try:
    import django
    django.setup()
    from django.contrib.auth import get_user_model
    User = get_user_model()
    if not User.objects.filter(username="admin").exists():
        User.objects.create_superuser("admin", "admin@example.com", "admin123")
        print("    ✓ Superuser created: admin / admin123")
    else:
        print("    ✓ Superuser already exists.")
except Exception as e:
    print(f"    WARNING: Could not create superuser: {e}")

print("\n============================================")
print("  DONE! Now run:  python manage.py runserver")
print("  App   -> http://127.0.0.1:8000")
print("  Admin -> http://127.0.0.1:8000/admin")
print("  Login -> admin / admin123")
print("============================================\n")
