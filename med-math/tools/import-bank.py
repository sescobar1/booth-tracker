#!/usr/bin/env python3
"""Turn the publisher's QTI test-bank export into SQL for the private med_math_bank table.

    python3 -I med-math/tools/import-bank.py TestBank.zip OWNER_UUID > bank.sql

Then paste bank.sql into Supabase (SQL Editor -> New query -> Run). Keep bank.sql and the zip
out of this repository: the questions and answer keys must stay private.

The bank's Module 1 (Roman numerals) is not in the book's table of contents, so it is skipped;
bank Module 2 (Fractions) is Chapter 1 (m1) and so on up to Module 25 = Chapter 24 (m24).
Questions that need a picture (labels, syringes) and essay questions are skipped too.
"""
import html, io, json, re, sys, zipfile
from collections import Counter

ALLOWED = {'div', 'p', 'br', 'ol', 'ul', 'li', 'b', 'i', 'u', 'strong', 'em', 'sup', 'sub', 'table', 'tr', 'td', 'th', 'tbody'}
STARTS = r'(What|How|Is|Are|Calculate|Determine|Find|Round|Which|Express|Give|Write|Convert|Available|Order|The|If|Use)'


def clean(h):
    h = re.sub(r'<(textEntryInteraction|extendedTextInteraction)[^>]*/>', ' ____ ', h, flags=re.I)

    def tag(m):
        close, name = m.group(1), m.group(2).lower()
        if name not in ALLOWED:
            return ''
        return '<br>' if name == 'br' else '<%s%s>' % ('/' if close else '', name)
    h = re.sub(r'<(/?)\s*([a-zA-Z0-9]+)[^>]*>', tag, h)
    h = html.unescape(h).replace('\xa0', ' ')
    h = re.sub(r'\s+', ' ', h).strip()
    h = re.sub(r'(\s*<br>)?\s*_{3,}\s*(</div>)?$', r'\2', h)          # the answer box at the end
    h = re.sub(r'(\s*<br>\s*)+(</div>)?$', r'\2', h)
    h = re.sub(r'([A-Za-z0-9][.)?]?|[.)?])' + STARTS + r'\b', r'\1 \2', h)  # "6 hoursHow many" -> "6 hours How many"
    h = re.sub(r'([?:])(?=[A-Za-z0-9])|(\.)(?=[A-Z][a-z])', lambda m: (m.group(1) or m.group(2)) + ' ', h)  # "order:150 mg", "D5W.Order"
    return h.strip()


def parse(name, x):
    body = re.search(r'<itemBody>(.*)</itemBody>', x, re.S)
    if not body:
        return None, 'empty'
    body = body.group(1)
    if re.search(r'<img|<object', body, re.I):
        return None, 'needs a picture'
    if 'extendedTextInteraction' in body:
        return None, 'essay'
    ident = re.search(r'identifier="([^"]+)"', x).group(1).replace('exam_', '')
    if 'choiceInteraction' in body:
        choices = re.findall(r'<simpleChoice identifier="([^"]+)"[^>]*>(.*?)</simpleChoice>', body, re.S)
        cr = re.search(r'<correctResponse>(.*?)</correctResponse>', x, re.S)
        correct = re.findall(r'<value>([^<]+)</value>', cr.group(1)) if cr else []
        key = [clean(c[1]) for c in choices if c[0] in correct]
        if len(correct) > 1 or 'select all' in body.lower():
            return None, 'select all that apply'
        if len(key) != 1:
            return None, 'no answer key'
        return dict(id=ident, kind='mc', prompt=clean(re.sub(r'<choiceInteraction.*</choiceInteraction>', '', body, flags=re.S)),
                    choices=[clean(c[1]) for c in choices], answers=[key]), None
    blanks = re.findall(r'<textEntryInteraction responseIdentifier="([^"]+)"', body)
    acc = []
    for b in blanks:
        v = r'<variable identifier="%s"\s*/>' % re.escape(b)
        val = r'<baseValue baseType="(?:float|string|integer)">([^<]*)</baseValue>'
        vals = re.findall(val + r'\s*' + v, x) + re.findall(v + r'\s*' + val, x)
        acc.append(list(dict.fromkeys(html.unescape(s).strip() for s in vals if s.strip())))
    if not blanks or any(not a for a in acc):
        return None, 'no answer key'
    return dict(id=ident, kind='blank', prompt=clean(body), choices=[], answers=acc), None


def items(path):
    """Yield (bank module number, item xml) from the outer zip of per-module zips."""
    outer = zipfile.ZipFile(path)
    for name in outer.namelist():
        m = re.match(r'Module_(\d+)_', name.split('/')[-1])
        if not m or not name.endswith('.zip'):
            continue
        inner = zipfile.ZipFile(io.BytesIO(outer.read(name)))
        for f in sorted(inner.namelist()):
            if f.startswith('AssessmentItems/') and f.endswith('.xml'):
                yield int(m.group(1)), inner.read(f).decode('utf-8', 'replace')


# Answer keys in the publisher's file that are wrong (checked by re-solving every question),
# and questions to leave out. Applied on every import so a re-import keeps the fixes.
CORRECTIONS = {
    '5c26a76f-4b0b-4dad-b804-cb57d52a9602': [['1.4']],                 # Geopen 550 mg at 400 mg/mL = 1.375 -> 1.4 mL (key said 1.1)
    '126f0d27-4078-4327-8e72-0f6f4a1784ab': [['711.2']],               # 28 in = 711.2 mm (key also accepted 700)
    '8ab1c113-c192-4ded-87da-e01404e6b6e8': [['4.3']],                 # 9 lb 9 oz = 4.35 -> 4.3 kg (key also accepted 4.4)
    '12d41d4d-6e14-422a-a09f-2d82aa2a5bae': [['3000000', '3,000,000']],  # 3 g = 3,000,000 mcg (key said 300000)
    'bde0b114-e84e-4a27-a489-80ecf507cf45': [['75']],                  # 165 lb = 75 kg (key said 3.75)
    'e78f42ba-bcc3-44f8-8aed-5e013912cade': [['2.2', '2.2 g']],        # 13,230 mg/day / 6 doses = 2.2 g (key said 22 g)
}
LEAVE_OUT = {'e844fea2-6a53-429e-a35e-d9bf28871492',                     # "464.1  0.009": the operator is missing
             'd9434f55-39b4-41d9-acab-9226c380d586'}                     # "Humalog may be given IV" keyed False; current labeling allows IV use


def q(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    path, owner = sys.argv[1], sys.argv[2]
    if not re.fullmatch(r'[0-9a-f-]{36}', owner):
        sys.exit('OWNER_UUID should look like 2bce50b8-9628-4c3d-9bb1-c69fdc5d32da')
    rows, kept, skipped, seen = [], Counter(), Counter(), set()
    for n, x in items(path):
        if n < 2:
            skipped['not in the book (Roman numerals)'] += 1
            continue
        it, why = parse(n, x)
        if not it:
            skipped[why] += 1
            continue
        if it['id'] in LEAVE_OUT:
            skipped['question is broken'] += 1
            continue
        it['answers'] = CORRECTIONS.get(it['id'], it['answers'])
        mod = 'm%d' % (n - 1)
        if it['id'] in seen:                 # the same question can be in two chapters' banks
            it['id'] += '-' + mod
        seen.add(it['id'])
        kept[mod] += 1
        rows.append('(%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)' % (q(it['id']), q(owner), q(mod), q(it['kind']), q(it['prompt']),
                                                                    q(json.dumps(it['choices'], ensure_ascii=False)), q(json.dumps(it['answers'], ensure_ascii=False))))
    out = sys.stdout
    out.write('-- Med Math test bank: %d questions. Private: do not commit this file.\n' % len(rows))
    for i in range(0, len(rows), 100):
        out.write('insert into public.med_math_bank (id, owner, module, kind, prompt, choices, answers) values\n')
        out.write(',\n'.join(rows[i:i + 100]))
        out.write('\non conflict (id) do update set module = excluded.module, kind = excluded.kind, prompt = excluded.prompt, choices = excluded.choices, answers = excluded.answers;\n')
    print('Kept %d questions: %s' % (len(rows), ', '.join('%s %d' % (k, kept[k]) for k in sorted(kept, key=lambda s: int(s[1:])))), file=sys.stderr)
    print('Skipped: %s' % dict(skipped), file=sys.stderr)


if __name__ == '__main__':
    main()
