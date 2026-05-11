from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "public" / "icons"
SHOTS = ROOT / "public" / "screenshots"
ICONS.mkdir(parents=True, exist_ok=True)
SHOTS.mkdir(parents=True, exist_ok=True)

PRIMARY = (108, 92, 231)
SECONDARY = (0, 206, 201)
ACCENT = (253, 203, 110)
BACKGROUND = (248, 249, 255)
WHITE = (255, 255, 255)
DARK = (31, 42, 55)


def gradient(size):
    img = Image.new("RGB", size, BACKGROUND)
    draw = ImageDraw.Draw(img)
    w, h = size
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(PRIMARY[0] * (1 - t) + SECONDARY[0] * t)
        g = int(PRIMARY[1] * (1 - t) + SECONDARY[1] * t)
        b = int(PRIMARY[2] * (1 - t) + SECONDARY[2] * t)
        draw.line((0, y, w, y), fill=(r, g, b))
    return img


def draw_star(draw, cx, cy, outer, inner, fill):
    import math
    points = []
    for i in range(10):
        angle = math.pi / 2 + i * math.pi / 5
        radius = outer if i % 2 == 0 else inner
        x = cx + math.cos(angle) * radius
        y = cy - math.sin(angle) * radius
        points.append((x, y))
    draw.polygon(points, fill=fill)


def make_icon(size, path):
    img = gradient((size, size))
    draw = ImageDraw.Draw(img)
    pad = int(size * 0.08)
    draw.rounded_rectangle((pad, pad, size - pad, size - pad), radius=int(size * 0.22), fill=(255, 255, 255, 220))
    draw_star(draw, size / 2, size / 2, size * 0.22, size * 0.1, ACCENT)
    img.save(path)


def make_shot(size, path, mobile=False):
    img = gradient(size)
    draw = ImageDraw.Draw(img)
    w, h = size
    draw.rounded_rectangle((40, 40, w - 40, h - 40), radius=36, fill=(255, 255, 255))
    draw.rounded_rectangle((80, 110, w - 80, 190), radius=24, fill=(248, 249, 255))
    draw.rounded_rectangle((80, 220, w - 80, 360 if not mobile else 420), radius=24, fill=(245, 248, 255))
    for i in range(3):
        top = 400 + i * 90 if not mobile else 470 + i * 120
        draw.rounded_rectangle((80, top, w - 80, top + (60 if not mobile else 80)), radius=22, fill=(238, 242, 255))
    img.save(path)


make_icon(192, ICONS / "icon-192.png")
make_icon(512, ICONS / "icon-512.png")
make_shot((1280, 720), SHOTS / "dashboard-desktop.png", mobile=False)
make_shot((720, 1280), SHOTS / "dashboard-mobile.png", mobile=True)
print("Generated PWA assets.")
