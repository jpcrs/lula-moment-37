"""Read the native head and foot arcs used by the suit animation rig.

Uses local extracted indexed frames; it does not draw or modify artwork.
"""
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GROUPS = {
    'pl11': {'idle': list(range(1, 14)), 'forward': list(range(16, 27)), 'backward': list(range(28, 39))},
    'pl16': {'idle': list(range(2, 6)) + list(range(16, 24)), 'forward': list(range(32, 40)) + [48, 49], 'backward': list(range(40, 48))},
}


def components(points):
    remaining = set(points)
    result = []
    while remaining:
        start = remaining.pop()
        queue = [start]
        for x, y in queue:
            for p in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                if p in remaining:
                    remaining.remove(p)
                    queue.append(p)
        if len(queue) >= 5:
            result.append(queue)
    return sorted(result, key=len, reverse=True)


def landmarks(name, pixels):
    # Ken's bare feet use his skin ramp; Chun-Li's boots use white/gray.
    foot_colors = range(34, 48) if name == 'pl11' else (1, 10, 11, 12, 13, 14, 15)
    boot_top = -22 if name == 'pl11' else -36
    foot_pixels = [(x, y) for x, y, c in pixels if y > boot_top and c in foot_colors]
    feet = components(foot_pixels)
    if len(feet) < 2:
        # Crossing boots touch in the source; split around their two centers.
        center = (min(x for x, y in foot_pixels) + max(x for x, y in foot_pixels))/2
        feet = [[p for p in foot_pixels if p[0] < center], [p for p in foot_pixels if p[0] >= center]]
    feet = sorted(feet[:2], key=lambda p: sum(x for x, y in p) / len(p))
    assert len(feet) == 2, (name, feet)
    # The sole center follows horizontal stepping and vertical lift; unlike
    # sprite bounds it is unaffected by trailing cloth or outstretched hands.
    soles = []
    for part in feet:
        bottom = max(y for x, y in part)
        sole = [(x, y) for x, y in part if y >= bottom-3]
        soles.append([round(sum(x for x, y in sole)/len(sole), 2), bottom])
    hair = [(x, y) for x, y, c in pixels if y < -73 and c in
            (range(48, 52) if name == 'pl11' else (8, 9))]
    head = [round(sum(x for x, y in hair)/len(hair), 2), round(sum(y for x, y in hair)/len(hair), 2)]
    return {'head': head, 'feet': soles}


result = {}
for name, groups in GROUPS.items():
    blob = (ROOT / 'outputs/character-study' / (name+'-frames.bin')).read_bytes()
    frames = {}
    pos = 136
    for _ in range(struct.unpack_from('<I', blob, 4)[0]):
        cg, w, h, left, top, size = struct.unpack_from('<HHHhhI', blob, pos)
        pos += 14
        pixels = [(left+x, top+y, blob[pos+y*w+x]) for y in range(h) for x in range(w) if blob[pos+y*w+x]]
        pos += size
        if cg - (14656 if name == 'pl11' else 19456) in sum(groups.values(), []):
            frames[cg] = landmarks(name, pixels)
    base = 14656 if name == 'pl11' else 19456
    result[name] = {'anchor': base + (9 if name == 'pl11' else 18), 'groups': {key: [base+i for i in values] for key, values in groups.items()},
                    'frames': {str(cg): frame for cg, frame in frames.items()}}
    print(name)
    for cg, frame in frames.items():
        if cg-base in (2, 16, 18, 21, 32, 36, 40, 44, 46, 47):
            print(cg-base, frame)
(ROOT / 'web/characters/motion.json').write_text(json.dumps(result, indent=2)+'\n')
