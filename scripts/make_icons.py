"""
Generate the league's app icons from the WACL badge motif.

    python scripts/make_icons.py

The home-screen and PWA icons are cut from public/media/wacl-badge.png — the
pixel-art crest — trimmed of its outer margin so the badge fills the tile.
iOS applies its own rounded mask, so these stay square.

At favicon sizes the crest's lettering and laurels turn to mush, so 16 and 32
fall back to a single blocky W drawn from a 5x7 bitmap font in the badge's own
palette: gold on deep navy. Same identity, legible at a tab.
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public'
BADGE = ROOT / 'public/media/wacl-badge.png'

# Sampled from the badge itself (quantised), so the small icons match it.
NAVY = (1, 2, 72)          # #010248
GOLD = '#fbc55c'
GOLD_RGB = (251, 197, 92)
BLUE_RGB = (8, 87, 184)    # #0857b8

# How much of the source to trim per side: drops the dark surround so the
# crest fills the tile, while leaving its border intact under the iOS mask.
TRIM = 0.09

FONT: dict[str, list[str]] = {
    'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
}
GW, GH = 5, 7


def render_badge(size: int) -> Image.Image:
    im = Image.open(BADGE).convert('RGB')
    w, h = im.size
    box = (int(w * TRIM), int(h * TRIM), int(w * (1 - TRIM)), int(h * (1 - TRIM)))
    # NEAREST keeps the pixel-art edges hard when the crop divides evenly;
    # LANCZOS is kinder at the small end where detail has to be resolved.
    resample = Image.NEAREST if size >= 256 else Image.LANCZOS
    return im.crop(box).resize((size, size), resample)


def render_letter(size: int, glyph: str = 'W', grid: int = 9) -> Image.Image:
    """The fallback mark: one blocky letter, gold on navy, with a soft bloom."""
    scale = size / grid
    x0 = (grid - GW) // 2
    y0 = (grid - GH) // 2
    placed = [
        (x0 + col, y0 + row)
        for row, bits in enumerate(FONT[glyph])
        for col, bit in enumerate(bits)
        if bit == '1'
    ]

    def paint(canvas: Image.Image, colour) -> None:
        d = ImageDraw.Draw(canvas)
        for gx, gy in placed:
            d.rectangle(
                [round(gx * scale), round(gy * scale),
                 round((gx + 1) * scale) - 1, round((gy + 1) * scale) - 1],
                fill=colour,
            )

    img = Image.new('RGB', (size, size), NAVY)
    for colour, blur, strength in ((GOLD_RGB, scale * 0.9, 0.7), (BLUE_RGB, scale * 2.2, 0.35)):
        layer = Image.new('RGB', (size, size), (0, 0, 0))
        paint(layer, colour)
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
        layer = layer.point(lambda v, s=strength: int(v * s))
        img = ImageChops.add(img, layer)
    paint(img, GOLD)
    return img


def save_png(img: Image.Image, path) -> None:
    """A PNG with 256 colours or fewer is written as an exact palette — every
    colour its own index, pixel for pixel the same, a third of the bytes.
    The 512 badge has 64 colours; the smaller ones pick up antialiasing and
    stay truecolour."""
    rgb = img.convert('RGB')
    pixels = list(rgb.getdata())
    colours = sorted(set(pixels))
    if len(colours) > 256:
        rgb.save(path, 'PNG', optimize=True)
        return
    index = {c: i for i, c in enumerate(colours)}
    pal = Image.new('P', rgb.size)
    pal.putdata([index[c] for c in pixels])
    pal.putpalette([v for c in colours for v in c] + [0] * (768 - 3 * len(colours)))
    pal.save(path, 'PNG', optimize=True)


def main() -> None:
    if not BADGE.exists():
        raise SystemExit(f'missing badge art: {BADGE}')

    for name, size in (('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)):
        save_png(render_badge(size), OUT / name)
    # The badge as drawn on the page (Crest.tsx): WebP at the two sizes it is
    # actually shown, a fifth of the PNG for the same pixels.
    for name, size in (('crest-192.webp', 192), ('crest-128.webp', 128)):
        render_badge(size).convert('RGB').save(OUT / name, 'WEBP', quality=90, method=6)
        print(f'{name:<22} {size}x{size}  badge  {(OUT / name).stat().st_size // 1024} KB')

    for name, size in (('favicon-32.png', 32), ('favicon-16.png', 16)):
        render_letter(size).save(OUT / name, 'PNG', optimize=True)
        print(f'{name:<22} {size}x{size}  letter W')


if __name__ == '__main__':
    main()
