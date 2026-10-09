"""Build the Family Cookbook kit friends can set up as their own copy.

Creates cookbook-kit.zip (served at /cookbook-kit.zip) from recipes/index.html plus the files in
tools/cookbook-kit/. The setup guide friends read is recipes/friends.html (also packed as SETUP-GUIDE.html).

Run from the repository root after changing recipes/index.html, recipes/friends.html,
recipes/functions/* or tools/cookbook-kit/*:
  python3 tools/build-cookbook-kit.py
"""
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
KIT = 'tools/cookbook-kit/'

MANIFEST = {
    "name": "Family Cookbook",
    "short_name": "Cookbook",
    "display": "standalone",
    "background_color": "#fbf6ee",
    "theme_color": "#fbf6ee",
    "icons": [
        {"src": "cook-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "cook-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "cook-icon.svg", "sizes": "any", "type": "image/svg+xml"},
    ],
}

README = """# Family Cookbook

A free recipe website for your family: snap photos of recipe cards, and everyone you share it with
can read, add and fix recipes.

**Setup instructions:** open `SETUP-GUIDE.html` (download it and open it in your browser), or read them online at
https://sescobar1.github.io/booth-tracker/recipes/friends.html

Short version:
1. Upload everything in this kit to a new GitHub repository and turn on GitHub Pages (Settings -> Pages -> main, / (root)).
2. Make a free Supabase project, and run `setup.sql` in its SQL Editor.
3. Add your sign-in in Supabase (Authentication -> Users -> Add user, Auto Confirm).
4. Paste your Supabase Project URL and anon key into `config.js`.
5. Deploy `supabase-functions/recipe-upload.ts` as an Edge Function named `recipe-upload` with JWT verification off.
"""


def page():
    s = open('recipes/index.html', encoding='utf-8').read()
    swaps = [
        ('../planner/config.js', 'config.js'),
        ('../planner/vendor/supabase.js', 'vendor/supabase.js'),
        ('../refresh.js', 'refresh.js'),
        ("CFG.cookbookOwner || 'Shaana'", "CFG.cookbookOwner || 'Me'"),
        ("CFG.cookbookFooter || 'Made with love by the Escobar family 💛'", "CFG.cookbookFooter || 'Made with love 💛'"),
        ('Sign in with your Planner email and password to add recipes.', 'Sign in with the email and password you made in Supabase to add recipes.'),
        ('// Same sign-in as the Planner on this device, so Shaana is already signed in here.', '// Stays signed in on this device.'),
    ]
    for a, b in swaps:
        assert a in s, 'missing in recipes/index.html: ' + a
        s = s.replace(a, b)
    s = s.replace("Shaana's", "the owner's").replace('Shaana', 'the owner')
    for word in ('Shaana', 'Escobar', 'mxcwtyubndlsudejizld', 'planner/'):
        assert word not in s, 'personal detail left in kit page: ' + word
    return s


def main():
    files = {
        'index.html': page(),
        'manifest.webmanifest': json.dumps(MANIFEST, indent=2) + '\n',
        'README.md': README,
        'config.js': open(KIT + 'config.js', encoding='utf-8').read(),
        'setup.sql': open(KIT + 'setup.sql', encoding='utf-8').read(),
        'SETUP-GUIDE.html': open('recipes/friends.html', encoding='utf-8').read()
            .replace('href="../cookbook-kit.zip" download>⬇ Download the cookbook kit', 'href="https://sescobar1.github.io/booth-tracker/cookbook-kit.zip">⬇ You already have the kit (this file came in it)')
            .replace('src="cook-icon-180.png"', 'src="cook-icon-180.png"'),
        'supabase-functions/recipe-upload.ts': open('recipes/functions/recipe-upload/index.ts', encoding='utf-8').read(),
        'supabase-functions/recipe-read.ts': open('recipes/functions/recipe-read/index.ts', encoding='utf-8').read(),
    }
    copies = {
        'vendor/supabase.js': 'planner/vendor/supabase.js',
        'refresh.js': 'refresh.js',
        'cook-icon.svg': 'recipes/cook-icon.svg',
        'cook-icon-180.png': 'recipes/cook-icon-180.png',
        'cook-icon-192.png': 'recipes/cook-icon-192.png',
        'cook-icon-512.png': 'recipes/cook-icon-512.png',
    }
    for name, text in files.items():
        if name != 'config.js' and name != 'SETUP-GUIDE.html':
            assert 'mxcwtyubndlsudejizld' not in text, name
    with zipfile.ZipFile('cookbook-kit.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        for name, text in files.items():
            z.writestr('cookbook-kit/' + name, text)
        for name, src in copies.items():
            z.write(src, 'cookbook-kit/' + name)
    print('wrote cookbook-kit.zip with', len(files) + len(copies), 'files')


if __name__ == '__main__':
    main()
