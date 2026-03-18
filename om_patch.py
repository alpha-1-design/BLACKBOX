with open('www/overlay-manager.js', 'r') as f:
    content = f.read()

old = """    { id: 'com.whatsapp',              name: 'WhatsApp',    icon: '💬' },
    { id: 'com.instagram.android',     name: 'Instagram',   icon: '📷' },
    { id: 'com.facebook.katana',       name: 'Facebook',    icon: '👤' },
    { id: 'com.twitter.android',       name: 'Twitter/X',   icon: '🐦' },
    { id: 'com.google.android.gm',     name: 'Gmail',       icon: '📧' },
    { id: 'com.snapchat.android',      name: 'Snapchat',    icon: '👻' },
    { id: 'com.telegram.messenger',    name: 'Telegram',    icon: '✈️' },
    { id: 'com.google.android.apps.messaging', name: 'Messages', icon: '💬' },
    { id: 'com.tiktok.android',        name: 'TikTok',      icon: '🎵' },
    { id: 'com.linkedin.android',      name: 'LinkedIn',    icon: '💼' },"""

content = content.replace(old, '    // User adds their own apps below')

with open('www/overlay-manager.js', 'w') as f:
    f.write(content)

print("patched OK")
