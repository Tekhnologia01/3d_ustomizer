import os
import smtplib
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

print("User:", os.getenv('EMAIL_HOST_USER'))
print("Password length:", len(os.getenv('EMAIL_HOST_PASSWORD', '')))

try:
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.set_debuglevel(1)
    server.starttls()
    server.login(os.getenv('EMAIL_HOST_USER'), os.getenv('EMAIL_HOST_PASSWORD'))
    print("Login successful!")
    server.quit()
except Exception as e:
    print(f"Login failed: {e}")
