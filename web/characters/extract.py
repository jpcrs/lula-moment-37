"""Decode the original player frames as indexed animation templates for Aseprite.

Reads the locally prepared AFS; no disc resources are changed. The tile LZ and
Morton layout follow 3SX's mtrans.c and PPGFile.c. Output is intermediate data.
"""
from pathlib import Path
import json
import struct

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'outputs/character-study'
OUT.mkdir(parents=True, exist_ok=True)
afs = (ROOT / 'web/assets/challenge.afs').read_bytes()
resources = json.loads((ROOT / 'web/assets/manifest.json').read_text())['resources']


def resource(name):
    entry = next(r for r in resources if r['name'] == name)
    offset, size = struct.unpack_from('<II', afs, 8 + entry['id'] * 8)
    return afs[offset:offset + size]


def u32(blob, offset):
    return struct.unpack_from('<I', blob, offset)[0]


def decompress(blob, offset, size):
    out = bytearray()
    while len(out) < size:
        value = blob[offset]
        offset += 1
        kind = value & 0xc0
        if kind == 0:
            out.append(value)
        elif kind in (0x40, 0x80):
            if kind == 0x80:
                value = ((value & 63) << 8) | blob[offset]
                offset += 1
                distance, count = (value >> 6) + 1, (value & 63) + 2
            else:
                value &= 63
                distance, count = (value >> 2) + 1, (value & 3) + 2
            for _ in range(count):
                out.append(out[-distance])
        else:
            high = value & 0x30
            for _ in range((value & 15) + 2):
                value2 = blob[offset]
                offset += 1
                out.extend((high | (value2 >> 4), high | (value2 & 15)))
    assert len(out) == size
    return out


def morton(x, y):
    return sum(((x >> n) & 1) << (2 * n + 1) |
               ((y >> n) & 1) << (2 * n) for n in range(5))

MORTON = [morton(x, y) for y in range(32) for x in range(32)]

def extract_character(name, base, textures, costume):
    blob = resource(name + '.bin')
    palette = resource(name + 'pl.bin')[costume * 128:costume * 128 + 128]
    count = u32(blob, 0) // 4
    frames = []
    tiles = {}
    for index in range(count):
        offset = u32(blob, index * 4)
        parts = struct.unpack_from('<H', blob, offset)[0]
        pixels = {}
        x = y = 0
        for n in range(parts):
            dx, dy, attr, code = struct.unpack_from('<hhHH', blob, offset + 2 + n * 8)
            x -= dx
            y += dy
            if code not in tiles:
                tile_offset = textures + u32(blob, textures + code * 4)
                wh = blob[tile_offset]
                size = (wh & 3) + 1
                width, height = (wh & 0xe0) >> 2, (wh & 0x1c) * 2
                data = decompress(blob, tile_offset + 1, 64 * size * size)
                tiles[code] = width, height, data
            width, height, data = tiles[code]
            for ty in range(height):
                for tx in range(width):
                    sx = width - tx - 1 if attr & 0x8000 else tx
                    sy = height - ty - 1 if attr & 0x4000 else ty
                    value = data[MORTON[sy * 32 + sx]]
                    if value:
                        pixels[x + tx, -y + ty] = value
        if pixels:
            left = min(p[0] for p in pixels)
            top = min(p[1] for p in pixels)
            width = max(p[0] for p in pixels) - left + 1
            height = max(p[1] for p in pixels) - top + 1
            image = bytearray(width * height)
            for (x, y), value in pixels.items():
                image[(y - top) * width + x - left] = value
        else:
            left = top = 0
            width = height = 1
            image = b'\0'
        frames.append((base + index, width, height, left, top, image))
    with (OUT / (name + '-frames.bin')).open('wb') as out:
        out.write(b'M37I' + struct.pack('<I', count) + palette)
        for cg, width, height, left, top, image in frames:
            out.write(struct.pack('<HHHhhI', cg, width, height, left, top, len(image)))
            out.write(image)
    print(f'{name}: {count} frames, {len(tiles)} tiles decoded')


if __name__ == '__main__':
    extract_character('pl11', 14656, 0x118dc, 5)
    extract_character('pl16', 19456, 0x234c8, 0)
