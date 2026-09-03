#!/usr/bin/env python
import os
import sys
import django

# Setup Django
sys.path.insert(0, r'C:\Users\Saurabh Pansare\Desktop\3D\3D Logo on product')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from customizer.services.tripo import TripoService

print('Testing Tripo API connection...')
try:
    balance = TripoService.check_balance()
    print(f'API connection successful. Balance: {balance}')
except Exception as e:
    print(f'API connection failed: {e}')
