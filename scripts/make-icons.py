#!/usr/bin/env python3
"""Generate PWA icons (stdlib only): dark square with a green fuel-gauge arc and needle dot."""
import math, os, struct, zlib

BG = (0x0b, 0x0f, 0x14)
FG = (0x5f, 0xc0, 0x8a)

def render(size):
    cx, cy = size / 2, size * 0.58
    r_out, r_in = size * 0.36, size * 0.27
    dot_r = size * 0.07
    # needle dot sits on the arc mid-radius at 60 degrees from the left
    ang = math.radians(120)
    dx = cx + (r_out + r_in) / 2 * math.cos(ang)
    dy = cy - (r_out + r_in) / 2 * math.sin(ang)
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            d = math.hypot(px - cx, py - cy)
            on = r_in <= d <= r_out and py <= cy  # upper half ring
            if math.hypot(px - cx, py - cy) <= size * 0.045:  # hub
                on = True
            if math.hypot(px - dx, py - dy) <= dot_r:
                on = True
            row += bytes(FG if on else BG)
        rows.append(bytes(row))
    return b"".join(rows)

def chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    return c + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

def write_png(path, size):
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(render(size), 9)) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(data)

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for s in (180, 512):
        write_png(os.path.join(out, f"icon-{s}.png"), s)
