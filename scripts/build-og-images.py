#!/usr/bin/env python3
"""Build 1200x630 share images for Get It?.

Writes landing-site/og/<slug>.png. Each card is a short line (about eight
words, never the SEO title), the check-mark wordmark, and dotheygetit.app.

    python3 scripts/build-og-images.py

blog/build.js runs this after it writes posts. A new post gets a card from
its ogLine, or from a shortened h1 when ogLine is absent. Add an ogLine on
the post when the shortened title is clumsy.

Needs Pillow (pip install pillow). Fonts in scripts/fonts/ are SIL OFL.
"""

import math
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 630
ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / 'blog' / 'posts'
OUT = ROOT / 'landing-site' / 'og'
FONTS = Path(__file__).resolve().parent / 'fonts'

BG = (7, 11, 22)
TEXT = (234, 240, 255)
MUTED = (148, 163, 196)
ACCENT = (79, 140, 255)
ACCENT_SOFT = (125, 180, 255)
ACCENT2 = (139, 92, 255)
GREEN = (61, 220, 132)
AMBER = (255, 200, 87)
RED = (255, 107, 107)
WHITE = (255, 255, 255)

# Explicit card lines. A newline is a forced wrap. Pages that are not posts
# live here too. Post modules can set ogLine and that wins.
LINES = {
    'exit-ticket-ideas': 'Exit tickets\nthat show who got it',
    'assessment-for-learning-strategies': 'AfL that survives\na real lesson',
    'hinge-questions': 'Hinge questions\nfor tomorrow',
    'checking-for-understanding': 'Checks that show\nthe whole class',
    'spot-misconceptions-in-lesson': 'Spot the misconception\nbefore the bell',
    'cold-calling-vs-no-hands-up': 'Cold calling\nvs no-hands-up',
    'retrieval-practice-starters': 'Starters that show\nwhat stuck',
    'mini-whiteboards-vs-digital-checks': 'Whiteboards, or\na private check',
    'plickers-alternatives': 'When the check\nis not cards',
    'free-formative-assessment-tools': 'Free checks\nfor UK teachers',
    'how-do-you-know-who-understood': 'Who actually\nunderstood?',
    'exit-tickets-why-teachers-stop': 'Why teachers drop\nexit tickets',
    'pupils-quietly-faking-it': 'Pupils quietly\nfaking it',
    'blog': 'Checking\nunderstanding',
    'contact': 'Talk to\na real person',
    'terms': 'Terms of use',
}

PAGES = ('blog', 'contact', 'terms')


def font(name, size):
    path = FONTS / name
    if not path.is_file():
        raise SystemExit('missing font ' + str(path))
    return ImageFont.truetype(str(path), size)


def field(text, key):
    match = re.search(key + r""":\s*'((?:\\'|[^'])*)'""", text)
    if not match:
        return ''
    return match.group(1).replace("\\'", "'")


def strip_tags(value):
    return re.sub(r'<[^>]+>', '', value)


def punchy(title):
    """Shorten a post title when the author has not set a card line."""
    title = strip_tags(title).strip()
    title = title.split('|')[0]
    title = re.sub(r'\s*[—–-]\s*Get It\??\s*$', '', title, flags=re.I).strip()
    title = re.sub(r'\s*Get It\?\s*$', '', title).strip(' -–—')
    if ':' in title:
        head = title.split(':', 1)[0].strip()
        if 2 <= len(head.split()) <= 8:
            title = head
    words = title.split()
    if len(words) > 8:
        title = ' '.join(words[:8])
    return title


def word_count(line):
    return len(re.sub(r'\s+', ' ', line).strip().split())


def check_line(slug, line):
    if '|' in line or re.search(r'Get It\?', line):
        raise SystemExit(slug + ': card line must not include a site name or "|"')
    count = word_count(line)
    if count < 2 or count > 8:
        raise SystemExit(slug + ': card line should be 2–8 words, got %d (%r)' % (count, line))


def collect():
    cards = {}
    if POSTS.is_dir():
        for path in sorted(POSTS.glob('*.js')):
            text = path.read_text(encoding='utf-8')
            slug = field(text, 'slug')
            if not slug:
                raise SystemExit('no slug in ' + path.name)
            chosen = field(text, 'ogLine') or LINES.get(slug) or punchy(field(text, 'h1') or field(text, 'title'))
            cards[slug] = chosen.replace('\\n', '\n')
    for slug in PAGES:
        cards[slug] = LINES[slug]
    for slug, line in LINES.items():
        cards.setdefault(slug, line)
    for slug, line in cards.items():
        check_line(slug, line)
    return cards


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def glow(base, cx, cy, radius, rgb, peak):
    scale = 3
    sw, sh = W // scale, H // scale
    small = Image.new('L', (sw, sh), 0)
    px = small.load()
    scx, scy, sr = cx / scale, cy / scale, max(radius / scale, 1)
    for y in range(sh):
        dy = y - scy
        for x in range(sw):
            d = math.hypot(x - scx, dy) / sr
            if d < 1:
                px[x, y] = int(peak * (1 - d) ** 2)
    alpha = small.resize((W, H), Image.Resampling.LANCZOS)
    layer = Image.new('RGBA', (W, H), rgb + (0,))
    layer.putalpha(alpha)
    return Image.alpha_composite(base, layer)


def rounded_gradient(size, radius, c1, c2, c3):
    w, h = size
    grad = Image.new('RGBA', (w, h))
    px = grad.load()
    span = max(w + h - 2, 1)
    for y in range(h):
        for x in range(w):
            t = (x + y) / span
            if t < 0.42:
                rgb = lerp(c1, c2, t / 0.42)
            else:
                rgb = lerp(c2, c3, (t - 0.42) / 0.58)
            px[x, y] = rgb + (255,)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def stroke(draw_on, points, color, width):
    layer = Image.new('RGBA', draw_on.size, (0, 0, 0, 0))
    pen = ImageDraw.Draw(layer)
    r = width / 2
    for x, y in points:
        pen.ellipse((x - r, y - r, x + r, y + r), fill=color)
    pen.line(points, fill=color, width=width, joint='curve')
    return Image.alpha_composite(draw_on, layer)


def mark(size):
    tile = rounded_gradient((size, size), int(size * 0.28), ACCENT_SOFT, ACCENT, ACCENT2)
    # Favicon check, inset so the stroke stays inside the rounded square.
    pad = size * 0.22
    inner = size - pad * 2

    def pt(px, py):
        return (pad + px / 256 * inner, pad + py / 256 * inner)

    points = [pt(51.5, 135.3), pt(98.9, 184.3), pt(204.6, 71.8)]
    return stroke(tile, points, WHITE + (255,), max(4, int(size * 0.11)))


def wrap(text, face, max_width):
    if '\n' in text:
        return text.split('\n')
    words = text.split()
    lines, cur = [], ''
    for word in words:
        trial = word if not cur else cur + ' ' + word
        if face.getlength(trial) <= max_width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def fit_title(text, max_width):
    manual = '\n' in text
    for size in range(88, 46, -2):
        face = font('Fraunces-Italic.ttf', size)
        lines = wrap(text, face, max_width)
        if not lines or len(lines) > 3:
            continue
        if all(face.getlength(line) <= max_width for line in lines):
            return face, lines
    raise SystemExit('title does not fit: ' + text)


def draw_card(line):
    img = Image.new('RGBA', (W, H), BG + (255,))
    img = glow(img, 980, 40, 520, ACCENT, 78)
    img = glow(img, 180, 620, 420, ACCENT2, 46)

    canvas = ImageDraw.Draw(img)
    margin = 76
    logo = mark(72)
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    shadow.paste(logo, (margin, 62))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    # Tint the blur toward the accent so it reads as the site's mark shadow.
    tint = Image.new('RGBA', (W, H), ACCENT + (0,))
    tint.putalpha(shadow.getchannel('A').point(lambda a: int(a * 0.55)))
    img = Image.alpha_composite(img, tint)
    img.paste(logo, (margin, 58), logo)

    canvas = ImageDraw.Draw(img)
    word = font('Inter-Bold.ttf', 40)
    img_word = word.getbbox('Get It?')
    word_y = 58 + (72 - (img_word[3] - img_word[1])) / 2 - img_word[1]
    canvas.text((margin + 88, word_y), 'Get It?', font=word, fill=TEXT)

    # Green / amber / red: the three answers a check can return.
    dots = (GREEN, AMBER, RED)
    r = 9
    gap = 28
    right = W - margin
    cy = 58 + 36
    for i, color in enumerate(reversed(dots)):
        cx = right - r - i * gap
        blob = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(blob).ellipse((cx - r - 6, cy - r - 6, cx + r + 6, cy + r + 6), fill=color + (70,))
        img = Image.alpha_composite(img, blob.filter(ImageFilter.GaussianBlur(4)))
        ImageDraw.Draw(img).ellipse((cx - r, cy - r, cx + r, cy + r), fill=color + (255,))

    max_width = W - margin * 2
    face, lines = fit_title(line, max_width)
    ascent, descent = face.getmetrics()
    line_h = ascent + descent + 6
    block_h = line_h * len(lines) - 6
    top = 188 + (300 - block_h) / 2
    canvas = ImageDraw.Draw(img)
    for i, row in enumerate(lines):
        canvas.text((margin, top + i * line_h), row, font=face, fill=TEXT)

    domain = font('Inter-Medium.ttf', 26)
    canvas.text((margin, H - 78), 'dotheygetit.app', font=domain, fill=MUTED)
    return img.convert('RGB')


def main():
    cards = collect()
    OUT.mkdir(parents=True, exist_ok=True)
    for slug in sorted(cards):
        image = draw_card(cards[slug])
        dest = OUT / (slug + '.png')
        image.save(dest, 'PNG', optimize=True)
        shown = cards[slug].replace('\n', ' / ')
        print(slug + '  ' + shown)
    print('wrote %d images to %s' % (len(cards), OUT))


if __name__ == '__main__':
    try:
        main()
    except Exception as err:
        print('og images: ' + str(err), file=sys.stderr)
        raise
