"""Build the blank starter copy of Booth Tracker for friends.

Creates:
  starter/index.html            - the app with no personal data, served at /starter/ on this site
  starter/config.js             - blank settings (the welcome setup asks for name and booths)
  starter/manifest.webmanifest  - so it installs as its own home-screen app
  booth-tracker-starter.zip     - everything a friend needs to host their own copy on GitHub Pages

Run from the repository root after changing index.html, mobile.js, mobile.css or sw.js:
  python3 tools/build-starter.py
"""
import json
import os
import re
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

STARTER_CONFIG = """// Settings for this copy of Booth Tracker.
// The welcome setup asks for your name and booths; change them later under Import & backup -> Your booths.
window.BOOTH_CONFIG = {
  owner: '',
  storageKey: 'boothTrackerStarter',      // where this copy saves on the device
  docsDb: 'boothTrackerStarterDocs',      // where receipt photos are saved on the device
  startMonth: null,                       // month lists start in January of this year
  seedData: false,
  smartBooths: false,
  autoRent: true,                         // booth rent is added to each month automatically
  mileageFromJan: false,                  // scheduled trips start the week you set them up
  recipeCards: false,
  setup: true,                            // show the welcome setup the first time
  guideUrl: 'starter/guide.html',
  booths: [],
  cookieBooth: null,
  towns: [],
  routes: [],
  recipes: []
};
"""

MANIFEST = {
    "name": "Booth Tracker",
    "short_name": "Booth",
    "description": "Track booth sales, purchases, rent, mileage, and inventory.",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "background_color": "#faf7f1",
    "theme_color": "#24536f",
}


def starter_html(base):
    s = open('index.html', encoding='utf-8').read()
    s = s.replace("Shaana's Booth Tracker", "Booth Tracker")
    if base:
        s = s.replace('<head>', '<head><base href="../">', 1)
        s = s.replace('<script src="config.js"></script>', '<script src="starter/config.js"></script>')
        s = s.replace('href="manifest.webmanifest"', 'href="starter/manifest.webmanifest"')
    assert 'Shaana' not in s, 'personal name left in starter page'
    return s


def manifest(icon_prefix):
    m = dict(MANIFEST)
    m["icons"] = [
        {"src": icon_prefix + "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
        {"src": icon_prefix + "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        {"src": icon_prefix + "icon.svg", "sizes": "any", "type": "image/svg+xml"},
    ]
    return json.dumps(m, indent=2) + "\n"


def kit_sw():
    s = open('sw.js', encoding='utf-8').read()
    s = re.sub(r"const ASSETS = \[.*?\];",
               "const ASSETS = ['./', 'index.html', 'config.js', 'mobile.js', 'mobile.css', 'manifest.webmanifest', 'icon.svg', "
               "'icon-180.png', 'icon-192.png', 'icon-512.png', 'fonts/pacifico.woff2', 'fonts/patrick-hand.woff2'];", s, flags=re.S)
    return s.replace("const CACHE = 'booth-tracker-", "const CACHE = 'booth-starter-")


os.makedirs('starter', exist_ok=True)
open('starter/index.html', 'w', encoding='utf-8').write(starter_html(base=True))
open('starter/config.js', 'w', encoding='utf-8').write(STARTER_CONFIG)
open('starter/manifest.webmanifest', 'w', encoding='utf-8').write(manifest('../'))

with zipfile.ZipFile('booth-tracker-starter.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('index.html', starter_html(base=False))
    z.writestr('config.js', STARTER_CONFIG.replace("  guideUrl: 'starter/guide.html',\n", ''))
    z.writestr('manifest.webmanifest', manifest(''))
    z.writestr('sw.js', kit_sw())
    for f in ['mobile.js', 'mobile.css', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png',
              'fonts/pacifico.woff2', 'fonts/patrick-hand.woff2']:
        z.write(f, f)
    z.writestr('README.md', "# Booth Tracker\n\nA phone-first tracker for booth sales, purchases, rent, mileage, inventory, and taxes.\n"
               "Your data is saved on the device you use it on. Back it up from Import & backup.\n")
print('Built starter/ and booth-tracker-starter.zip')
