#!/usr/bin/env python3
"""
Compose and render the PocketShark opening-story soundtrack.

Original music (not borrowed from any game) in a classic 8/16-bit adventure
style: pulse-wave melodies, triangle bass, quick chiptune arpeggios, noise
drums and music-box bells. Every section is pinned to the story timeline in
src/story/intro.ts, so the mood changes exactly when the shark's does:

  0.0   mysterious music-box reef, cracks plink, sparkle on the hatch (9.4)
  9.6   "little explorer" theme, bouncy; a startled slide at 20.9 (jellyfish)
 28.0   warm "home" cadence
 34.0   thin and quiet; each "Hello?" (35 / 37.6 / 40.2) echoes away unanswered
 41.0   slow lonely minor theme; a sad "wah-wah" as the fish swim away (~47.5)
 54.0   crying: almost nothing, a few soft bells
 56.8   each glow flicker gets a rising twinkle, tension building
 61.5   he glows: bright chord burst, then the explorer theme comes back happy
 71.7   title fanfare

Usage:  python3 tools/compose_story_music.py   (needs numpy and ffmpeg)
Writes: assets/music/story.m4a
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 32000
LENGTH = 77.0
mix = np.zeros(int(SR * LENGTH))
rng = np.random.default_rng(7)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n, a, d, s, r, dur):
    """ADSR envelope, times in seconds; dur is the held time before release."""
    t = np.arange(n) / SR
    e = np.ones(n) * s
    if a > 0:
        e = np.where(t < a, t / a, e)
    dm = (t >= a) & (t < a + d)
    e = np.where(dm, 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    rel = t >= dur
    e = np.where(rel, s * np.exp(-(t - dur) / max(r, 1e-6) * 3), e)
    return e


def lowpass(x, k):
    """One-pole lowpass (k 0..1, smaller = darker) to tame raw pulse waves."""
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += k * (x[i] - acc)
        y[i] = acc
    return y


def osc(kind, m, dur, vib=0.0, slide_to=None, duty=0.25):
    n = int(SR * (dur + 0.6))
    t = np.arange(n) / SR
    f = np.full(n, hz(m))
    if slide_to is not None:
        f = hz(m) * (hz(slide_to) / hz(m)) ** np.clip(t / dur, 0, 1)
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) * 4, 0, 1))
    ph = np.cumsum(f) / SR
    fr = ph % 1.0
    if kind == 'pulse':
        w = np.where(fr < duty, 1.0, -1.0)
    elif kind == 'tri':
        w = 2 * np.abs(2 * fr - 1) - 1
    elif kind == 'sine':
        w = np.sin(2 * np.pi * ph)
    elif kind == 'bell':
        w = np.sin(2 * np.pi * ph) + 0.35 * np.sin(2 * np.pi * ph * 2.76) * np.exp(-t * 6)
    else:
        raise ValueError(kind)
    return w


def add(t0, sig, vol):
    i = int(t0 * SR)
    if i >= len(mix):
        return
    j = min(len(mix), i + len(sig))
    mix[i:j] += sig[: j - i] * vol


def note(t0, m, dur, inst='lead', vol=1.0, **kw):
    if inst == 'lead':  # bright pulse melody
        w = osc('pulse', m, dur, vib=kw.get('vib', 0.006), slide_to=kw.get('slide_to'), duty=kw.get('duty', 0.25))
        e = env(len(w), 0.01, 0.08, 0.7, 0.12, dur)
        add(t0, lowpass(w * e, 0.35), 0.16 * vol)
    elif inst == 'soft':  # mellow flute-like lead for sad parts
        w = osc('pulse', m, dur, vib=kw.get('vib', 0.012), duty=0.5, slide_to=kw.get('slide_to'))
        e = env(len(w), 0.06, 0.2, 0.75, 0.3, dur)
        add(t0, lowpass(w * e, 0.12), 0.17 * vol)
    elif inst == 'bass':
        w = osc('tri', m, dur)
        e = env(len(w), 0.005, 0.1, 0.8, 0.06, dur)
        add(t0, w * e, 0.20 * vol)
    elif inst == 'arp':
        w = osc('pulse', m, dur, duty=0.125)
        e = env(len(w), 0.002, 0.05, 0.4, 0.03, dur)
        add(t0, lowpass(w * e, 0.3), 0.05 * vol)
    elif inst == 'pad':
        w = osc('tri', m, dur, vib=0.003)
        e = env(len(w), min(1.2, dur * 0.4), 0.2, 0.9, 0.8, dur)
        add(t0, w * e, 0.06 * vol)
    elif inst == 'bell':
        w = osc('bell', m, dur)
        t = np.arange(len(w)) / SR
        e = np.exp(-t * kw.get('decay', 3.0)) * np.clip(t / 0.003, 0, 1)
        add(t0, w * e, 0.12 * vol)


def hat(t0, vol=1.0, length=0.04):
    n = int(SR * length)
    w = rng.uniform(-1, 1, n) * np.exp(-np.arange(n) / SR * 90)
    w = w - lowpass(w, 0.25)  # keep the hiss
    add(t0, w, 0.07 * vol)


def kick(t0, vol=1.0):
    n = int(SR * 0.18)
    t = np.arange(n) / SR
    f = 120 * np.exp(-t * 25) + 45
    w = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18)
    add(t0, w, 0.22 * vol)


def crash(t0, vol=1.0, length=1.6):
    n = int(SR * length)
    w = rng.uniform(-1, 1, n) * np.exp(-np.arange(n) / SR * 3)
    w = w - lowpass(w, 0.2)
    add(t0, w, 0.06 * vol)


def chord(t0, roots, dur, inst='pad', vol=1.0):
    for m in roots:
        note(t0, m, dur, inst, vol)


def melody(t0, beat, notes, inst='lead', vol=1.0, oct=0):
    """notes: list of (midi or None, beats). Returns end time."""
    t = t0
    for m, b in notes:
        if m is not None:
            note(t, m + oct, b * beat * 0.92, inst, vol)
        t += b * beat
    return t


C, D, E, F, G, A, B = 60, 62, 64, 65, 67, 69, 71

# ---------------------------------------------------------------- A: the egg
chord(0.0, [48, 55, 59, 64], 4.6, 'pad', 1.0)          # Cmaj7, mysterious and soft
chord(4.7, [53, 57, 64, 71], 4.6, 'pad', 1.0)          # Fmaj7(#11)
for t, m in [(1.0, G + 12), (1.5, E + 12), (2.0, C + 24), (3.0, B + 12), (3.5, G + 12), (4.0, E + 12),
             (5.6, A + 12), (6.1, F + 12), (6.6, C + 24), (7.6, B + 12)]:
    note(t, m, 0.4, 'bell', 0.8)
for t in [5.0, 6.8, 8.2, 9.0]:                          # the shell cracking
    note(t, C + 36, 0.1, 'bell', 0.5, decay=14)
    hat(t, 0.6, 0.02)
for i, m in enumerate([C + 12, E + 12, G + 12, C + 24, E + 24, G + 24, C + 36]):  # hatch sparkle
    note(9.35 + i * 0.05, m, 0.25, 'bell', 0.9, decay=5)
crash(9.4, 0.6)

# ------------------------------------------------------ B: little explorer
B0, BEAT = 9.6, (28.0 - 9.6) / 32
THEME = [  # 8 bars of 4 beats
    [(C + 12, .5), (E + 12, .5), (G + 12, 1), (E + 12, .5), (G + 12, .5), (A + 12, 1)],
    [(G + 12, 1.5), (E + 12, .5), (C + 12, 1), (D + 12, 1)],
    [(E + 12, .5), (F + 12, .5), (G + 12, 1), (C + 24, 1), (B + 12, .5), (A + 12, .5)],
    [(G + 12, 3), (None, 1)],
    [(A + 12, .5), (G + 12, .5), (F + 12, 1), (E + 12, .5), (F + 12, .5), (G + 12, 1)],
    [(E + 12, 1), (C + 12, .5), (D + 12, .5), (E + 12, 2)],
    [(D + 12, .5), (E + 12, .5), (F + 12, 1), (A + 12, 1), (G + 12, 1)],
    [(C + 12, 1), (G, 1), (C + 12, 2)],
]
PROG = [  # bass root, chord tones for arps
    (36, [C, E, G]), (33, [A - 12, C, E]), (29, [F - 12, A - 12, C]), (31, [G - 12, B - 12, D]),
    (29, [F - 12, A - 12, C]), (33, [A - 12, C, E]), (31, [G - 12, B - 12, D]), (36, [C, E, G]),
]


def groove(t0, beat, bars, prog, theme, lead_vol=1.0, busy=False, oct=0):
    for b in range(bars):
        tb = t0 + b * 4 * beat
        root, tones = prog[b % len(prog)]
        for k, off in enumerate([0, 7, 12, 7]):                         # walking triangle bass
            note(tb + k * beat, root + off, beat * 0.85, 'bass', 1.0)
        for k in range(16 if busy else 8):                             # chiptune arpeggio
            step = beat / (4 if busy else 2)
            note(tb + k * step, tones[k % 3] + 12, step * 0.9, 'arp', 1.0)
        for k in range(4):                                             # drums
            if k in (0, 2):
                kick(tb + k * beat, 0.8)
            hat(tb + (k + 0.5) * beat, 0.8)
            if busy:
                hat(tb + k * beat, 0.5)
        melody(tb, beat, theme[b % len(theme)], 'lead', lead_vol, oct)


groove(B0, BEAT, 8, PROG, THEME)
note(20.9, G + 12, 0.45, 'lead', 1.3, slide_to=C + 6, vib=0)            # "whoa!" at the jellyfish

# ------------------------------------------------------------- C: new home
H0, HB = 28.0, 0.72
note(H0, 29, HB * 4, 'bass'); note(H0 + HB * 4, 31, HB * 2, 'bass'); note(H0 + HB * 6, 36, HB * 2, 'bass')
chord(H0, [F, A, C + 12], HB * 4, 'pad', 1.2)
chord(H0 + HB * 4, [G, B, D + 12], HB * 2, 'pad', 1.2)
chord(H0 + HB * 6, [E, G, C + 12], HB * 2.5, 'pad', 1.2)
melody(H0, HB, [(C + 12, 1), (A, 1), (F + 12, 2), (E + 12, 1), (D + 12, 1), (C + 12, 2)], 'soft', 1.1, 12)
for i, m in enumerate([C + 24, E + 24, G + 24]):
    note(30.4 + i * 0.12, m, 0.3, 'bell', 0.7)                           # a happy little sparkle

# ----------------------------------------------- D: calling out, no answer
chord(34.0, [45, 52, 57, 60], 3.6, 'pad', 0.9)                          # Am
chord(37.6, [41, 48, 57, 60], 2.6, 'pad', 0.8)                          # F
chord(40.2, [38, 50, 53, 57], 1.6, 'pad', 0.7)                          # Dm
for t in [35.0, 37.6, 40.2]:
    for echo in range(4):                                               # "Hel-lo?" ... echoing away
        v = 0.9 * (0.5 ** echo) * (0.7 if t > 40 else 1)
        note(t + echo * 0.38, E + 12, 0.16, 'soft', v)
        note(t + echo * 0.38 + 0.17, C + 12, 0.18, 'soft', v)

# ------------------------------------------------------- E: lonely theme
L0, LB = 41.0, 13.0 / 16
LONELY = [
    [(A, 1.5), (C + 12, .5), (B, 1), (A, 1)],
    [(G, 2), (F, 1), (E, 1)],
    [(None, 4)],                       # bar 3 is the fish swimming away (below)
    [(E, 3), (None, 1)],
]
for b, (root, ch) in enumerate([(33, [A, C + 12, E + 12]), (29, [F, A, C + 12]), (26, [D, F, A]), (28, [E, G + 1, B])]):
    tb = L0 + b * 4 * LB
    note(tb, root, LB * 3.8, 'bass', 0.6)
    chord(tb, ch, LB * 3.9, 'pad', 0.75)
    melody(tb, LB, LONELY[b], 'soft', 0.75)
# the sad "wah-wah" as the snacks swim away
WAH = 41.0 + 8 * LB + 0.2
for i, (a, b2) in enumerate([(G, F + 1), (F + 1, F), (F, E - 1)]):
    note(WAH + i * 0.6, a, 0.5, 'soft', 0.6, slide_to=b2, vib=0.02)
note(WAH + 1.8, E - 1, 1.1, 'soft', 0.55, vib=0.03)

# ------------------------------------------------------------ F: crying
chord(54.0, [50, 57, 65, 69], 2.8, 'pad', 0.55)                         # Dm, very soft
note(54.5, D + 24, 1.2, 'bell', 0.45, decay=1.5)
note(55.7, C + 24, 1.2, 'bell', 0.4, decay=1.5)

# ------------------------------------------------- G: the glow flickers
FLASHES = [56.8, 57.9, 58.7, 59.4, 60.05, 60.7]
chord(56.8, [41, 53, 57, 60], 1.9, 'pad', 0.7)                          # F
chord(58.7, [43, 55, 59, 62], 1.35, 'pad', 0.9)                         # G
chord(60.05, [43, 55, 60, 62, 65], 1.5, 'pad', 1.1)                     # G7sus, wanting to resolve
for i, t in enumerate(FLASHES):
    base = [C + 12, D + 12, E + 12, F + 12, G + 12, A + 12][i]
    for k, step in enumerate([0, 4, 7]):
        note(t + k * 0.07, base + step + 12, 0.3, 'bell', 0.55 + i * 0.08, decay=4)
for k in range(12):                                                     # a soft drum roll building up
    hat(60.3 + k * 0.1, 0.3 + k * 0.06, 0.05)

# ----------------------------------------------------- H: he's glowing!
crash(61.5, 1.2, 2.2)
kick(61.5, 1.2)
chord(61.5, [C, E, G, C + 12, E + 12], 1.0, 'lead', 0.55)
note(61.5, 36, 1.0, 'bass', 1.2)
for i, m in enumerate([C + 12, E + 12, G + 12, C + 24, E + 24, G + 24, C + 36, E + 36]):
    note(61.55 + i * 0.045, m, 0.3, 'bell', 0.85, decay=4)
J0, JB = 62.6, 60 / 132
groove(J0, JB, 5, PROG, THEME[:4] + [[(A + 12, .5), (B + 12, .5), (C + 24, 1), (D + 24, 1), (B + 12, 1)]], 1.05, busy=True)
for b in range(5):                                                      # harmony a third below
    melody(J0 + b * 4 * JB, JB, [(m - 3 if m else None, d) for m, d in (THEME[:4] + [[(A + 12, .5), (B + 12, .5), (C + 24, 1), (D + 24, 1), (B + 12, 1)]])[b]], 'lead', 0.35)

# ------------------------------------------------------------- I: fanfare
F0 = J0 + 20 * JB
trip = JB * 2 / 3
for k in range(3):
    note(F0 + k * trip, G + 12, trip * 0.8, 'lead', 1.1)
    note(F0 + k * trip, D + 12, trip * 0.8, 'lead', 0.5)
note(F0 + 3 * trip, C + 24, 2.2, 'lead', 1.2)
note(F0 + 3 * trip, G + 12, 2.2, 'lead', 0.6)
note(F0 + 3 * trip, E + 12, 2.2, 'lead', 0.5)
note(F0, 31, 3 * trip, 'bass'); note(F0 + 3 * trip, 36, 2.4, 'bass', 1.2)
kick(F0 + 3 * trip, 1.2); crash(F0 + 3 * trip, 1.0, 2.6)
for i, m in enumerate([C + 12, E + 12, G + 12, C + 24, E + 24, G + 24, C + 36]):
    note(F0 + 3 * trip + 0.2 + i * 0.06, m, 0.4, 'bell', 0.8, decay=3)

# ----------------------------------------------------------------- master
out = mix.copy()
for delay, gain in [(0.19, 0.22), (0.33, 0.14), (0.52, 0.08)]:          # small room so it isn't dry
    d = int(SR * delay)
    out[d:] += mix[:-d] * gain
fade = int(SR * 0.4)
out[:fade] *= np.linspace(0, 1, fade)
end = int(SR * (LENGTH - 1.2))
out[end:] *= np.linspace(1, 0, len(out) - end)
out = np.tanh(out * 1.4) / np.tanh(1.4)                                 # gentle glue
out = out / max(1e-9, np.max(np.abs(out))) * 0.89

here = os.path.dirname(os.path.abspath(__file__))
dest = os.path.join(here, '..', 'assets', 'music', 'story.m4a')
os.makedirs(os.path.dirname(dest), exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    wav = os.path.join(tmp, 'story.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((out * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '96k', dest], check=True)
print('wrote', os.path.normpath(dest))
