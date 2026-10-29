"""Deterministic music bed + SFX for the Quincena+ video. 120 BPM, D major, ~29.5 s.
Everything synthesized with numpy so the render is reproducible and royalty-free."""
import numpy as np, wave, sys

SR = 44100
DUR = 29.5
BPM = 120
BEAT = 60 / BPM
N = int(SR * DUR)
t = np.arange(N) / SR
out = np.zeros(N)
rng = np.random.default_rng(3)

def note(f, start, length, wave_fn, env=(0.01, 0.3, 0.6, 0.2), gain=0.2):
    a, d, s, r = env
    n = int(length * SR); i0 = int(start * SR)
    if i0 >= N: return
    n = min(n, N - i0)
    tt = np.arange(n) / SR
    e = np.ones(n)
    ai = int(a * SR); di = int(d * SR); ri = int(r * SR)
    if ai: e[:ai] = np.linspace(0, 1, ai)
    if di: e[ai:ai + di] = np.linspace(1, s, min(di, max(0, n - ai)))[:max(0, min(di, n - ai))]
    e[ai + di:] = s
    if ri and n > ri: e[-ri:] *= np.linspace(1, 0, ri)
    out[i0:i0 + n] += wave_fn(tt, f) * e * gain

def saw(tt, f):  # band-limited-ish saw via few harmonics
    return sum(np.sin(2 * np.pi * f * k * tt) / k for k in range(1, 7)) * 0.5
def sine(tt, f): return np.sin(2 * np.pi * f * tt)
def pluck(tt, f): return (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * 2 * f * tt) + 0.15 * np.sin(2 * np.pi * 3 * f * tt)) * np.exp(-tt * 5)
def tri(tt, f): return 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * tt))

def midi(m): return 440 * 2 ** ((m - 69) / 12)

# chord progression per bar (2 s): D - A - Bm - G  (I V vi IV)
D, A, Bm, G = [62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62]
prog = [D, A, Bm, G]
bars = int(DUR / (4 * BEAT)) + 1

# pads (soft saw, low-passed later)
for b in range(bars):
    ch = prog[b % 4]
    for m in ch:
        note(midi(m), b * 4 * BEAT, 4 * BEAT + 0.3, saw, env=(0.4, 0.5, 0.8, 0.4), gain=0.045)
        note(midi(m - 12), b * 4 * BEAT, 4 * BEAT + 0.3, tri, env=(0.4, 0.5, 0.8, 0.4), gain=0.05)

# bass on beats 1 and 3, octave below root
for b in range(bars):
    root = prog[b % 4][0] - 24
    for k in (0, 2):
        note(midi(root), b * 4 * BEAT + k * BEAT, BEAT * 0.9, sine, env=(0.005, 0.1, 0.6, 0.1), gain=0.22)
        note(midi(root), b * 4 * BEAT + k * BEAT + BEAT * 0.5, BEAT * 0.4, sine, env=(0.005, 0.1, 0.5, 0.05), gain=0.12)

# plucked arpeggio, 8ths, enters at bar 1 (after the hook), rests on the outro
for b in range(1, bars):
    ch = prog[b % 4]
    seq = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24, ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 24]
    for k, m in enumerate(seq):
        st = b * 4 * BEAT + k * BEAT / 2
        if st > 25.5: break
        note(midi(m), st, 0.5, pluck, env=(0.002, 0.05, 0.9, 0.1), gain=0.11 if k % 2 == 0 else 0.08)

# drums: kick on every beat (soft, from 5.5 s), hats on off-beats, clap on 2 & 4 from the deck scene
def kick(st, g=0.5):
    i0 = int(st * SR); n = int(0.25 * SR)
    if i0 + n > N: return
    tt = np.arange(n) / SR
    f = 50 + 110 * np.exp(-tt * 28)
    out[i0:i0 + n] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9) * g
def hat(st, g=0.08, length=0.05):
    i0 = int(st * SR); n = int(length * SR)
    if i0 + n > N: return
    nz = rng.standard_normal(n); nz = nz - np.convolve(nz, np.ones(8) / 8, 'same')  # crude high-pass
    out[i0:i0 + n] += nz * np.exp(-np.arange(n) / SR * 60) * g
def clap(st, g=0.12):
    i0 = int(st * SR); n = int(0.18 * SR)
    if i0 + n > N: return
    nz = rng.standard_normal(n); nz = nz - np.convolve(nz, np.ones(4) / 4, 'same')
    out[i0:i0 + n] += nz * np.exp(-np.arange(n) / SR * 22) * g

beats = int(DUR / BEAT)
for k in range(beats):
    st = k * BEAT
    if 5.5 <= st < 27:
        kick(st, 0.45 if k % 2 == 0 else 0.32)
    if 5.5 <= st < 25.5:
        hat(st + BEAT / 2)
    if 17.5 <= st < 25.5 and k % 2 == 1:
        clap(st)

# gentle low-pass on the whole bed (one-pole, applied twice)
def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); z = 0.0
    for i in range(len(x)):
        z = a * z + (1 - a) * x[i]; y[i] = z
    return y
music = lp(lp(out, 6500), 6500)

# --- SFX ---
sfx = np.zeros(N)
def whoosh(st, length=0.45, g=0.25):
    i0 = int(st * SR); n = int(length * SR)
    if i0 + n > N: return
    nz = rng.standard_normal(n)
    env = np.sin(np.linspace(0, np.pi, n)) ** 2
    sfx[i0:i0 + n] += lp(nz, 1800) * env * g
def ding(st, g=0.35):
    for f, gg, dec in ((1046.5, 1, 4), (1318.5, .6, 5), (2093, .3, 7)):
        i0 = int(st * SR); n = int(1.2 * SR)
        if i0 + n > N: return
        tt = np.arange(n) / SR
        sfx[i0:i0 + n] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * dec) * g * gg
def tick(st, g=0.3):
    i0 = int(st * SR); n = int(0.04 * SR)
    tt = np.arange(n) / SR
    sfx[i0:i0 + n] += np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt * 120) * g
def pop(st, g=0.22):
    i0 = int(st * SR); n = int(0.12 * SR)
    tt = np.arange(n) / SR
    f = 300 + 500 * np.exp(-tt * 40)
    sfx[i0:i0 + n] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 30) * g

# timeline (mirrors index.html)
for st in (2.5, 5.5, 9.5, 17.5, 21.5, 25.5): whoosh(st - 0.1)
pop(2.55); pop(6.8); tick(11.6, 0.35)            # logo pop, cupo pill, tap
whoosh(12.4, 0.3, 0.15); ding(13.55)            # send -> money sent
for i in range(3): pop(17.75 + i * .18, .15)    # cards
for i in range(4): pop(22.0 + i * .25, .15)     # features
pop(25.55, .2)

mix = music + sfx
mix[-int(1.2 * SR):] *= np.linspace(1, 0, int(1.2 * SR))
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.9
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'audio.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('audio ok', DUR, 's')
