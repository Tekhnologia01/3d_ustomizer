import os

path = r'c:\Users\Saurabh Pansare\Desktop\3d_ustomizer\frontend\src\components\SetupPage.tsx'
with open(path, 'rb') as f:
    b = f.read()

# Replace encoded utf-8 bytes that mistakenly got re-saved incorrectly.
b = b.replace(b'\xe3\x80\xa6', b'...')     # wait, ellipsis is \xe2\x80\xa6
b = b.replace(b'\xe2\x80\xa6', b'...')     # ...
b = b.replace(b'\xc3\xa2\xe2\x82\xac\xc2\xa6', b'...') # actual mojibake for â€¦
b = b.replace(b'\xc3\x82\xe2\x80\x94', b'-') # mojibake for Â€” 
b = b.replace(b'\xc3\xa2\xe2\x82\xac\xe2\x84\xa2', b"'")
b = b.replace(b'\xc3\xa2\xe2\x82\xac\xc5\x93', b'"')
b = b.replace(b'\xc3\xa2\xe2\x82\xac\xc2\x9d', b'"')
b = b.replace(b'\xc3\xa2\xe2\x80\x9c\xcc\x88', b' ')

# But an easier way: decode as utf-8, replace, write.
with open(path, 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

text = text.replace('â€¦', '...')
text = text.replace('Â€”', '—') 
text = text.replace('â€º', '›')
text = text.replace('â“˜', 'ℹ')
text = text.replace('â€°', 'ℹ')
text = text.replace('â€', '')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
