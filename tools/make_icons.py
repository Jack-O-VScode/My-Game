#!/usr/bin/env python3
"""Generates the PWA icon set with the standard library only.

Draws the pet rock procedurally (implicit ellipses + supersampling for
anti-aliasing) and writes PNGs by hand, so the repo needs no image
dependencies. Run from the project root:

    python3 tools/make_icons.py
"""

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

BG_TOP = (58, 47, 92)
BG_BOTTOM = (24, 20, 38)
GLOW = (94, 74, 140)
ROCK = (141, 139, 149)
ROCK_SHADE = (101, 99, 111)
ROCK_LIGHT = (176, 174, 184)
EYE_WHITE = (253, 251, 247)
EYE_DARK = (36, 33, 44)
MOUTH = (43, 39, 51)
SPARK = (255, 209, 102)
MOSS = (95, 158, 87)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def over(dst, src, alpha):
    """Alpha-composite src over dst."""
    return tuple(round(dst[i] * (1 - alpha) + src[i] * alpha) for i in range(3))


def ellipse(x, y, cx, cy, rx, ry):
    """<= 1 inside the ellipse."""
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2


# Mouth curve sample points in unit space (a gentle smile).
MOUTH_PTS = [
    (0.38 + 0.24 * t, 0.665 + 0.075 * math.sin(math.pi * t))
    for t in [i / 24 for i in range(25)]
]


def mouth_hit(x, y, w):
    for mx, my in MOUTH_PTS:
        if (x - mx) ** 2 + (y - my) ** 2 <= w * w:
            return True
    return False


def sample(x, y, maskable):
    """Colour of the unit-square point (x, y), or None for transparent."""
    # Art shrinks into the maskable safe zone; background stays full bleed.
    if maskable:
        x = 0.5 + (x - 0.5) / 0.74
        y = 0.5 + (y - 0.5) / 0.74

    # --- background -----------------------------------------------------
    if not maskable:
        # rounded square
        r = 0.2
        dx = max(abs(x - 0.5) - (0.5 - r), 0.0)
        dy = max(abs(y - 0.5) - (0.5 - r), 0.0)
        if math.hypot(dx, dy) > r:
            return None

    col = lerp(BG_TOP, BG_BOTTOM, min(1.0, max(0.0, y)))
    glow = max(0.0, 1.0 - math.hypot(x - 0.5, y - 0.58) / 0.62)
    col = over(col, GLOW, 0.35 * glow * glow)

    if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
        return col

    # --- sparkle (behind the rock, top right) ---------------------------
    sx, sy = x - 0.79, y - 0.26
    if math.sqrt(abs(sx)) + math.sqrt(abs(sy)) < math.sqrt(0.085):
        col = over(col, SPARK, 0.95)

    # --- rock body ------------------------------------------------------
    inside = (
        ellipse(x, y, 0.50, 0.63, 0.35, 0.27) <= 1
        or ellipse(x, y, 0.37, 0.58, 0.22, 0.21) <= 1
        or ellipse(x, y, 0.63, 0.55, 0.25, 0.23) <= 1
    ) and y <= 0.845

    if not inside:
        # ground shadow
        if ellipse(x, y, 0.5, 0.855, 0.42, 0.045) <= 1:
            col = over(col, (0, 0, 0), 0.28)
        return col

    shade_t = min(1.0, max(0.0, (x * 0.55 + y * 0.75 - 0.42) / 0.62))
    body = lerp(ROCK_LIGHT, ROCK_SHADE, shade_t)
    col = body if body else ROCK

    # moss tuft on the shoulder
    if ellipse(x, y, 0.30, 0.50, 0.10, 0.05) <= 1 or ellipse(x, y, 0.42, 0.455, 0.075, 0.04) <= 1:
        col = over(col, MOSS, 0.92)

    # --- face -----------------------------------------------------------
    for (ex, ey, er, px, py, pr) in (
        (0.405, 0.575, 0.088, 0.415, 0.588, 0.040),
        (0.605, 0.552, 0.080, 0.615, 0.565, 0.036),
    ):
        if ellipse(x, y, ex, ey, er, er) <= 1:
            col = EYE_WHITE
            if ellipse(x, y, px, py, pr, pr) <= 1:
                col = EYE_DARK
            elif ellipse(x, y, ex - er * 0.35, ey - er * 0.35, er * 0.2, er * 0.2) <= 1:
                col = (255, 255, 255)

    if mouth_hit(x, y, 0.021):
        col = MOUTH

    return col


def render(size, maskable, ss=3):
    """Returns RGBA bytes for one icon."""
    rows = []
    step = 1.0 / (size * ss)
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px * ss + sx + 0.5) * step
                    y = (py * ss + sy + 0.5) * step
                    c = sample(x, y, maskable)
                    if c is not None:
                        r += c[0]
                        g += c[1]
                        b += c[2]
                        a += 255
            n = ss * ss
            if a == 0:
                row += bytes((0, 0, 0, 0))
            else:
                hits = a // 255
                row += bytes((r // hits, g // hits, b // hits, a // n))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        out = struct.pack(">I", len(data)) + tag + data
        return out + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)
    print(f"  {path.name}  {size}x{size}  {len(png) / 1024:.1f} KB")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, False, 3),
        ("icon-512.png", 512, False, 2),
        ("icon-maskable-192.png", 192, True, 3),
        ("icon-maskable-512.png", 512, True, 2),
        ("apple-touch-icon.png", 180, True, 3),
        ("favicon-64.png", 64, False, 4),
    ]
    print("writing icons ->", OUT)
    for name, size, maskable, ss in jobs:
        write_png(OUT / name, size, render(size, maskable, ss))


if __name__ == "__main__":
    main()
