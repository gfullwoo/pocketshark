#!/usr/bin/env python3
"""
Render the in-game audio for the home reef: a quiet looping background tune and
short sound effects. Original, in the same chiptune style as the story music.

  assets/music/reef-loop.m4a   gentle loop (F major, 84 BPM, 16 bars, ~46 s)
  assets/sfx/eat-krill.wav     quick bubbly "nom"
  assets/sfx/eat-shrimp.wav    crunchy pop
  assets/sfx/eat-gold.wav      sparkly chime
  assets/sfx/eat-glow.wav      shimmering twinkle (glowing plankton)
  assets/sfx/hurt.wav          cartoony "boing-ouch" with a soft thud

Usage:  python3 tools/compose_game_audio.py   (needs numpy and ffmpeg)
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 32000
rng = np.random.default_rng(11)
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lowpass(x, k):
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += k * (x[i] - acc)
        y[i] = acc
    return y


def tone(kind, f0, dur, f1=None, vib=0.0, duty=0.25, extra=0.6):
    n = int(SR * (dur + extra))
    t = np.arange(n) / SR
    f = np.full(n, float(f0)) if f1 is None else f0 * (f1 / f0) ** np.clip(t / dur, 0, 1)
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * 6 * t))
    ph = np.cumsum(f) / SR
    fr = ph % 1.0
    if kind == 'pulse':
        return np.where(fr < duty, 1.0, -1.0)
    if kind == 'tri':
        return 2 * np.abs(2 * fr - 1) - 1
    if kind == 'sine':
        return np.sin(2 * np.pi * ph)
    if kind == 'bell':
        return np.sin(2 * np.pi * ph) + 0.35 * np.sin(2 * np.pi * ph * 2.76) * np.exp(-t * 6)
    raise ValueError(kind)


def adsr(n, a, d, s, r, dur):
    t = np.arange(n) / SR
    e = np.ones(n) * s
    e = np.where(t < a, t / max(a, 1e-6), e)
    dm = (t >= a) & (t < a + d)
    e = np.where(dm, 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    return np.where(t >= dur, s * np.exp(-(t - dur) / max(r, 1e-6) * 3), e)


def decay(n, rate):
    t = np.arange(n) / SR
    return np.exp(-t * rate) * np.clip(t / 0.002, 0, 1)


def noise(n):
    return rng.uniform(-1, 1, n)


class Track:
    def __init__(self, seconds):
        self.buf = np.zeros(int(SR * seconds))

    def add(self, t0, sig, vol):
        i = int(t0 * SR)
        j = min(len(self.buf), i + len(sig))
        if i < len(self.buf):
            self.buf[i:j] += sig[: j - i] * vol


def write_wav(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def finish(x, peak=0.85):
    x = x - np.mean(x)
    fade = int(SR * 0.01)
    x[-fade:] *= np.linspace(1, 0, fade)
    return x / max(1e-9, np.max(np.abs(x))) * peak


# ------------------------------------------------------------------ effects
def sfx_krill():
    tr = Track(0.32)
    for i, (a, b) in enumerate([(70, 77), (76, 84)]):  # two quick rising "nom" pops
        w = tone('pulse', hz(a), 0.06, hz(b), duty=0.5, extra=0.05)
        tr.add(i * 0.07, lowpass(w * decay(len(w), 30), 0.3), 0.8)
    b = tone('sine', hz(88), 0.08, hz(96), extra=0.08)  # little bubble
    tr.add(0.15, b * decay(len(b), 25), 0.35)
    return finish(tr.buf)


def sfx_shrimp():
    tr = Track(0.38)
    n = int(SR * 0.05)
    crunch = noise(n) * decay(n, 60)
    tr.add(0.0, crunch - lowpass(crunch, 0.3), 0.7)  # crunch
    tr.add(0.04, noise(n) * decay(n, 70), 0.25)
    w = tone('pulse', hz(67), 0.09, hz(79), duty=0.25, extra=0.05)
    tr.add(0.05, lowpass(w * decay(len(w), 22), 0.35), 0.75)  # pop
    c = tone('bell', hz(91), 0.2, extra=0.1)
    tr.add(0.13, c * decay(len(c), 14), 0.35)  # tiny chime
    return finish(tr.buf)


def sfx_gold():
    tr = Track(0.75)
    for i, m in enumerate([84, 88, 91, 96]):  # sparkly arpeggio
        c = tone('bell', hz(m), 0.3, extra=0.3)
        tr.add(i * 0.06, c * decay(len(c), 7), 0.5)
    s = tone('sine', hz(100), 0.4, extra=0.2)
    tr.add(0.2, s * decay(len(s), 9), 0.2)
    return finish(tr.buf)


def sfx_glow():
    tr = Track(0.7)
    g = tone('sine', hz(79), 0.45, hz(91), vib=0.01, extra=0.2)  # shimmer up
    tr.add(0.0, g * adsr(len(g), 0.04, 0.1, 0.6, 0.15, 0.45), 0.45)
    for i, m in enumerate([91, 95, 98]):
        c = tone('bell', hz(m), 0.25, extra=0.2)
        tr.add(0.08 + i * 0.09, c * decay(len(c), 10), 0.35)
    return finish(tr.buf, 0.75)


def sfx_hurt():
    tr = Track(0.7)
    w = tone('pulse', hz(69), 0.38, hz(52), vib=0.05, duty=0.5, extra=0.1)  # "bwoing" down
    tr.add(0.0, lowpass(w * adsr(len(w), 0.005, 0.1, 0.7, 0.08, 0.38), 0.25), 0.7)
    n = int(SR * 0.2)
    t = np.arange(n) / SR
    thud = np.sin(2 * np.pi * np.cumsum(110 * np.exp(-t * 18) + 45) / SR) * np.exp(-t * 16)
    tr.add(0.0, thud, 0.9)  # soft thud
    sw = tone('tri', hz(64), 0.15, hz(60), extra=0.05)
    tr.add(0.4, sw * decay(len(sw), 12), 0.25)  # little "ow" tail
    return finish(tr.buf)


# --------------------------------------------------------------- reef loop
def reef_loop():
    bpm, bars = 84, 16
    beat = 60 / bpm
    length = bars * 4 * beat
    tr = Track(length + 3)
    F, G, A, Bb, C, D, E = 65, 67, 69, 70, 72, 74, 76
    prog = [  # gentle F major / Lydian feel
        (41, [F, A, C, E]), (43, [G, Bb + 1, D, F]), (45, [A, C, E, G]), (41, [F, A, C, E]),
        (38, [D, F, A, C]), (43, [G, Bb + 1, D, F]), (36, [C, E, G, Bb]), (41, [F, A, C, E]),
    ]
    melody = [  # music-box melody, (midi or None, beats)
        [(C + 12, 1), (A + 12, 1), (G + 12, 2)], [(F + 12, 1), (G + 12, 1), (A + 12, 2)],
        [(C + 24, 1.5), (A + 12, .5), (G + 12, 2)], [(F + 12, 3), (None, 1)],
        [(D + 12, 1), (F + 12, 1), (A + 12, 2)], [(G + 12, 1), (F + 12, 1), (E + 12, 2)],
        [(E + 12, 1), (G + 12, 1), (C + 24, 1), (Bb + 12, 1)], [(A + 12, 3), (None, 1)],
        [(None, 2), (A + 12, 1), (C + 24, 1)], [(D + 24, 2), (C + 24, 2)],
        [(A + 12, 1), (G + 12, 1), (A + 12, 2)], [(None, 4)],
        [(F + 12, 1), (A + 12, 1), (D + 24, 2)], [(C + 24, 1), (Bb + 12, 1), (G + 12, 2)],
        [(E + 12, 1), (F + 12, 1), (G + 12, 1), (E + 12, 1)], [(F + 12, 4)],
    ]
    for b in range(bars):
        t0 = b * 4 * beat
        root, chord = prog[b % len(prog)]
        # soft triangle bass: root and fifth
        for k, off in enumerate([0, 7]):
            w = tone('tri', hz(root + off), beat * 1.8, extra=0.4)
            tr.add(t0 + k * 2 * beat, w * adsr(len(w), 0.02, 0.2, 0.7, 0.3, beat * 1.8), 0.22)
        # mellow pulse pad, slow attack
        for m in chord:
            w = lowpass(tone('pulse', hz(m), beat * 4, duty=0.5, extra=0.8), 0.06)
            tr.add(t0, w * adsr(len(w), 0.6, 0.3, 0.8, 0.6, beat * 3.9), 0.035)
        # lazy broken-chord ripple on the off-beats
        for k in range(4):
            m = chord[(k + b) % len(chord)] + 12
            w = tone('bell', hz(m), 0.2, extra=0.6)
            tr.add(t0 + (k + 0.5) * beat, w * decay(len(w), 5), 0.05)
        # very soft shaker
        for k in range(8):
            n = int(SR * 0.03)
            sh = noise(n) * decay(n, 120)
            tr.add(t0 + k * beat / 2, sh - lowpass(sh, 0.25), 0.02 if k % 2 else 0.035)
        # music-box melody
        t = t0
        for m, d in melody[b]:
            if m is not None:
                w = tone('bell', hz(m), d * beat, extra=1.0)
                tr.add(t, w * decay(len(w), 2.2), 0.14)
            t += d * beat
    x = tr.buf
    # seamless loop: fold the tail (ringing notes, echoes) back onto the start
    n = int(SR * length)
    out = x[:n].copy()
    tail = x[n:]
    out[: len(tail)] += tail
    for delay, gain in [(0.23, 0.2), (0.41, 0.12)]:  # small room, wrapped around the loop
        d = int(SR * delay)
        out = out + np.roll(out, d) * gain
    out = np.tanh(out * 1.3) / np.tanh(1.3)
    # The AAC file gets a few ms of silent padding at the end, and the player
    # jumps back to the start; short fades turn that join into a soft dip, not a click.
    fade = int(SR * 0.025)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out / max(1e-9, np.max(np.abs(out))) * 0.8


def main():
    sfx = {'eat-krill': sfx_krill(), 'eat-shrimp': sfx_shrimp(), 'eat-gold': sfx_gold(), 'eat-glow': sfx_glow(), 'hurt': sfx_hurt()}
    for name, x in sfx.items():
        p = os.path.join(ASSETS, 'sfx', f'{name}.wav')
        write_wav(p, x)
        print('wrote', os.path.normpath(p))
    loop = reef_loop()
    dest = os.path.join(ASSETS, 'music', 'reef-loop.m4a')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        w = os.path.join(tmp, 'loop.wav')
        write_wav(w, loop)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', w, '-c:a', 'aac', '-b:a', '80k', dest], check=True)
    print('wrote', os.path.normpath(dest))


if __name__ == '__main__':
    main()
