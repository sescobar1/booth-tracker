#!/usr/bin/env python3
"""Record the "Watch how to do it" narration with the Kokoro neural voice.

    node -e "global.window={};require('./med-math/walkthroughs.js');console.log(JSON.stringify(window.MedMathVideos))" > steps.json
    python3 med-math/tools/make-audio.py steps.json kokoro-v1.0.onnx voices-v1.0.bin

Writes med-math/audio/<chapter>-<step>.mp3 and med-math/audio/manifest.json, which maps each file
to the sentence it says. Only new or changed sentences are recorded again, and the player uses a
recording only when its sentence still matches, so editing walkthroughs.js never plays stale audio.
Runs on GitHub (.github/workflows/med-math-audio.yml) whenever walkthroughs.js changes.
"""
import json, os, subprocess, sys, tempfile

import soundfile as sf
from kokoro_onnx import Kokoro

VOICE, SPEED = 'af_heart', 0.95   # a warm, clear American English voice
OUT = os.path.join(os.path.dirname(__file__), '..', 'audio')

# Spelled-out letters read better as words for the neural voice.
SAY = {'P O': 'P.O.', 'B I D': 'B.I.D.', 'T I D': 'T.I.D.', 'Q I D': 'Q.I.D.', 'Q D': 'Q.D.', 'N P H': 'N.P.H.',
       'N S': 'N.S.', 'U 100': 'U-100', 'MAR': 'M.A.R.'}


def speakable(text):
    for k, v in SAY.items():
        text = text.replace(k, v)
    return text


def main():
    steps_path, model, voices = sys.argv[1:4]
    videos = json.load(open(steps_path))
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(man_path)) if os.path.exists(man_path) else {}
    want = {f'{vid}-{i}': st['s'] for vid, v in videos.items() for i, st in enumerate(v['steps'])}
    todo = [k for k, s in want.items() if old.get(k) != s or not os.path.exists(os.path.join(OUT, k + '.mp3'))]
    print(f'{len(want)} sentences, {len(todo)} to record')
    if todo:
        tts = Kokoro(model, voices)
        for n, key in enumerate(todo, 1):
            samples, rate = tts.create(speakable(want[key]), voice=VOICE, speed=SPEED, lang='en-us')
            with tempfile.NamedTemporaryFile(suffix='.wav') as wav:
                sf.write(wav.name, samples, rate)
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav.name, '-ac', '1', '-ar', '24000', '-b:a', '48k',
                                os.path.join(OUT, key + '.mp3')], check=True)
            print(f'  {n}/{len(todo)} {key}')
    for f in os.listdir(OUT):   # drop recordings for steps that no longer exist
        if f.endswith('.mp3') and f[:-4] not in want:
            os.remove(os.path.join(OUT, f))
    with open(man_path, 'w') as fh:
        json.dump(dict(sorted(want.items())), fh, indent=0, ensure_ascii=False)


if __name__ == '__main__':
    main()
