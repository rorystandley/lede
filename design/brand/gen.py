#!/usr/bin/env python3
"""Generate the full 'lede' brand icon set (flat emerald, iOS-style squircle)."""
import math, os

OUT = os.path.dirname(os.path.abspath(__file__))

EMERALD = "#12B981"   # locked brand green
MUTE    = "#C4C9D2"   # de-emphasised story lines
INK     = "#14151A"

# --- the lede mark: top line lifted + lit, story muted beneath (512 box) ---
MARK = """  <rect x="140" y="160" width="236" height="44" rx="22" fill="{lede}"/>
  <rect x="140" y="242" width="196" height="26" rx="13" fill="{body}"/>
  <rect x="140" y="284" width="214" height="26" rx="13" fill="{body}"/>
  <rect x="140" y="326" width="150" height="26" rx="13" fill="{body}"/>"""

def squircle_path(cx=256, cy=256, a=256, n=5.0, steps=240):
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        ct, st = math.cos(t), math.sin(t)
        x = cx + a * math.copysign(abs(ct) ** (2.0 / n), ct)
        y = cy + a * math.copysign(abs(st) ** (2.0 / n), st)
        pts.append((x, y))
    d = "M %.2f %.2f " % pts[0] + "".join("L %.2f %.2f " % p for p in pts[1:]) + "Z"
    return d

SQ = squircle_path()

def svg(body, label="lede"):
    return (f'<svg width="512" height="512" viewBox="0 0 512 512" '
            f'xmlns="http://www.w3.org/2000/svg" role="img" aria-label="{label}">\n'
            f'{body}\n</svg>\n')

def write(name, content):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)
    print("wrote", name)

# 1. Master / app icon — squircle, solid emerald, white mark
write("lede-icon.svg", svg(
    f'  <path d="{SQ}" fill="{EMERALD}"/>\n' +
    MARK.format(lede="#FFFFFF", body="rgba(255,255,255,0.5)")))

# 2. Light — white squircle, emerald lede, muted body (with hairline for white bg)
write("lede-icon-light.svg", svg(
    f'  <path d="{SQ}" fill="#FFFFFF"/>\n' +
    MARK.format(lede=EMERALD, body=MUTE) +
    f'\n  <path d="{SQ}" fill="none" stroke="#000000" stroke-opacity="0.06"/>'))

# 3. Maskable — FULL-BLEED square (mark sits inside the 80% safe zone)
write("lede-maskable.svg", svg(
    f'  <rect width="512" height="512" fill="{EMERALD}"/>\n' +
    MARK.format(lede="#FFFFFF", body="#FFFFFF")
    .replace('fill="#FFFFFF"/>\n  <rect x="140" y="242"',
             'fill="#FFFFFF"/>\n  <rect x="140" y="242"')))

# maskable body lines need opacity; rebuild cleanly
write("lede-maskable.svg", svg(
    f'  <rect width="512" height="512" fill="{EMERALD}"/>\n'
    f'  <rect x="140" y="160" width="236" height="44" rx="22" fill="#FFFFFF"/>\n'
    f'  <rect x="140" y="242" width="196" height="26" rx="13" fill="#FFFFFF" fill-opacity="0.5"/>\n'
    f'  <rect x="140" y="284" width="214" height="26" rx="13" fill="#FFFFFF" fill-opacity="0.5"/>\n'
    f'  <rect x="140" y="326" width="150" height="26" rx="13" fill="#FFFFFF" fill-opacity="0.5"/>'))

# 4. Mono mark only (emerald) — transparent bg, for flexible placement on light
write("lede-mark-emerald.svg", svg(MARK.format(lede=EMERALD, body=MUTE)))

# 5. Mono mark only (white) — transparent bg, for dark surfaces
write("lede-mark-white.svg", svg(
    MARK.format(lede="#FFFFFF", body="rgba(255,255,255,0.5)")))

# 6. favicon.svg — squircle, emerald, SIMPLIFIED bold mark (legible at 16px)
TINY = (
    '  <rect x="108" y="150" width="296" height="60" rx="30" fill="{lede}"/>\n'
    '  <rect x="108" y="258" width="232" height="40" rx="20" fill="{body}"/>\n'
    '  <rect x="108" y="328" width="168" height="40" rx="20" fill="{body}"/>'
)
write("favicon.svg", svg(
    f'  <path d="{SQ}" fill="{EMERALD}"/>\n' +
    TINY.format(lede="#FFFFFF", body="rgba(255,255,255,0.55)")))

# 7. icon.svg — squircle, emerald, DETAILED mark (PWA purpose: any / app icon)
write("icon.svg", svg(
    f'  <path d="{SQ}" fill="{EMERALD}"/>\n' +
    MARK.format(lede="#FFFFFF", body="rgba(255,255,255,0.5)")))

print("EMERALD", EMERALD)
