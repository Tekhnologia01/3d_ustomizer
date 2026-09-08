import os

path = r'c:\Users\Saurabh Pansare\Desktop\3d_ustomizer\frontend\src\components\SetupPage.tsx'

with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace unicode with standard ASCII for safe rendering
text = text.replace('°', '(deg)')   # e.g., Angle(deg)
text = text.replace('·', '-')       # e.g., Backpack - 2 zones
text = text.replace('—', '-')       # e.g., ZONES - FRONT
text = text.replace('›', '>')       # e.g., > How to use
text = text.replace('ℹ', '(i)')
text = text.replace('…', '...')
text = text.replace('”', '"')
text = text.replace('“', '"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("Replaced unicode characters with ASCII safe variants.")
