"""Record the opening story's narration with a neural voice (Kokoro, voice af_heart).

Reads CAPTIONS from src/story/intro.ts, speaks each line, and lays the lines on
one 72-second track at their caption times, so it plays in step with story.m4a.
Writes assets/voice/narration.m4a and prints the NARRATION spans for intro.ts.

  pip install kokoro-onnx soundfile
  # model files: github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0)
  python tools/make_narration.py path/to/kokoro-v1.0.onnx path/to/voices-v1.0.bin

Change VOICE to try another: af_bella, af_nicole (soft), af_sky (younger).
"""
import os, re, subprocess, sys, tempfile
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

VOICE, SPEED, LEAD, SECONDS, SR = 'af_heart', 0.88, 0.1, 72, 24000
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(root, 'src/story/intro.ts')).read()
block = src.split('export const CAPTIONS')[1].split(']\n')[0]
caps = re.findall(r"\{ t: ([\d.]+), text: '(.*?)' \}", block)

k = Kokoro(sys.argv[1], sys.argv[2])
track = np.zeros(int(SECONDS * SR), dtype=np.float32)
spans = []
for t, text in caps:
    s, sr = k.create(text.replace('…', '...'), voice=VOICE, speed=SPEED, lang='en-us')
    s = (s / (np.abs(s).max() + 1e-9) * 0.89).astype(np.float32)
    a = int((float(t) + LEAD) * SR)
    track[a:a + len(s)] += s
    spans.append((round(float(t) + LEAD, 2), round(len(s) / sr, 2)))

out = os.path.join(root, 'assets/voice/narration.m4a')
with tempfile.NamedTemporaryFile(suffix='.wav') as w:
    sf.write(w.name, track, SR)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', w.name, '-ac', '1', '-c:a', 'aac', '-b:a', '64k', out], check=True)
print('export const NARRATION: [number, number][] = [' + ', '.join(f'[{a}, {d}]' for a, d in spans) + ']')
