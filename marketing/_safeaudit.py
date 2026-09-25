"""
Ground-truth safe-area audit.

_beatqa.js measured the rects I *think* are on screen. This measures the pixels
that are actually lit, which cannot lie about where content landed.

Content is found by edge strength: the scene backgrounds are smooth gradients
(low gradient), text/figures/panels have hard edges (high gradient). So the
bounding box of strong-gradient pixels is the true content extent.

Compares against the real TikTok / YouTube Shorts UI insets rather than the
guessed PADS in scenes.js.
"""
import subprocess
import sys
import os
import numpy as np

FF = os.path.join(os.path.dirname(__file__), '..', 'tutorial', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
W, H = 1080, 1920
SW, SH = 540, 960          # decode at half res, scale coords back
THRESH = 10                # gradient magnitude, 0-255
MINPIX = 3                 # ignore stray compression noise

# real platform UI insets, px in a 1080x1920 frame
INSETS = {
    'tiktok ': dict(t=150, b=400, l=40, r=150),
    'yshorts': dict(t=150, b=420, l=40, r=150),
}

FILMS = ['before', 'cover', 'middle', 'ninepm', 'nod', 'plainly',
         'proof', 'quiet', 'speak', 'twominutes']


def frames(mp4):
    """every 0.4s, as grey half-res"""
    cmd = [FF, '-hide_banner', '-loglevel', 'error', '-i', mp4,
           '-vf', f'fps=2.5,scale={SW}:{SH},format=gray',
           '-f', 'rawvideo', '-']
    raw = subprocess.run(cmd, capture_output=True).stdout
    n = len(raw) // (SW * SH)
    return np.frombuffer(raw[:n * SW * SH], dtype=np.uint8).reshape(n, SH, SW)


def content_box(frames_arr):
    """union bbox over the whole film, in full-res px"""
    gx = np.abs(np.diff(frames_arr.astype(np.int16), axis=2))
    gy = np.abs(np.diff(frames_arr.astype(np.int16), axis=1))
    gx = np.pad(gx, ((0, 0), (0, 0), (0, 1)))
    gy = np.pad(gy, ((0, 0), (0, 1), (0, 0)))
    m = (np.maximum(gx, gy) >= THRESH)

    cols = m.sum(axis=1) >= MINPIX           # per (frame, x)
    rows = m.sum(axis=2) >= MINPIX           # per (frame, y)
    xs = np.where(cols.any(axis=0))[0]
    ys = np.where(rows.any(axis=1))[0]
    if not len(xs) or not len(ys):
        return None
    return (int(xs[0] * 2), int(ys[0] * 2),
            int((xs[-1] + 1) * 2), int((ys[-1] + 1) * 2))


def main():
    print()
    print('  content bounds vs real platform insets  (1080x1920)')
    print('  ' + '-' * 74)
    print(f"  {'film':<12}{'top':>7}{'bottom':>8}{'left':>7}{'right':>7}   verdict")
    print('  ' + '-' * 74)

    worst = 0
    for f in FILMS:
        mp4 = os.path.join(os.path.dirname(__file__), 'out', 'beats', f + '-story.mp4')
        if not os.path.exists(mp4):
            print(f'  {f:<12}  MISSING')
            continue
        box = content_box(frames(mp4))
        if not box:
            print(f'  {f:<12}  could not measure')
            continue
        x0, y0, x1, y1 = box
        # how close content gets to each edge
        d_top, d_bot = y0, H - y1
        d_left, d_right = x0, W - x1

        bad = []
        for name, ins in INSETS.items():
            if d_top < ins['t']:
                bad.append(f'{name} top{ins["t"] - d_top}')
            if d_bot < ins['b']:
                bad.append(f'{name} bot{ins["b"] - d_bot}')
            if d_left < ins['l']:
                bad.append(f'{name} left{ins["l"] - d_left}')
            if d_right < ins['r']:
                bad.append(f'{name} right{ins["r"] - d_right}')
        worst = max(worst, len(bad))
        verdict = 'OK' if not bad else 'OVER by ' + ', '.join(bad)
        print(f'  {f:<12}{d_top:>7}{d_bot:>8}{d_left:>7}{d_right:>7}   {verdict}')

    print('  ' + '-' * 74)
    print(f'  insets used: TikTok t150 b400 l40 r150 | YT Shorts t150 b420 l40 r150')
    print(f'  content is measured from real pixels (gradient edges), not from DOM rects')
    print()
    return 0 if worst == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
