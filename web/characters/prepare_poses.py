"""Select distinct animation templates for the illustrated replacement art."""
from pathlib import Path
from collections import Counter
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[2]
STUDY = ROOT / 'outputs/character-study'


def frames(name):
    blob = (STUDY / f'{name}-frames.bin').read_bytes()
    pos = 136
    result = {}
    for _ in range(struct.unpack_from('<I', blob, 4)[0]):
        cg, w, h, x, y, size = struct.unpack_from('<HHHhhI', blob, pos)
        pos += 14
        data = blob[pos:pos + size]
        pos += size
        # Occupancy in world coordinates, at half the game's pixel resolution.
        mask = 0
        for yy in range(h):
            for xx in range(w):
                if data[yy * w + xx]:
                    gx, gy = (x + xx + 128) // 2, (y + yy + 160) // 2
                    if 0 <= gx < 128 and 0 <= gy < 96:
                        mask |= 1 << (gy * 128 + gx)
        result[cg] = dict(cg=cg, w=w, h=h, x=x, y=y, mask=mask)
    return result


def similarity(a, b):
    union = (a['mask'] | b['mask']).bit_count()
    return (a['mask'] & b['mask']).bit_count() / union if union else 1


if __name__ == '__main__':
    if '--map' in sys.argv:
        selection = json.loads((ROOT / 'web/characters/poses.json').read_text())
        mapping = []
        for name in ('pl11', 'pl16'):
            source = frames(name)
            for cg, frame in source.items():
                key = cg if cg in selection[name] else max(selection[name], key=lambda k: similarity(frame, source[k]))
                mapping.append(dict(cg=cg, key=key, x=frame['x'], y=frame['y'], w=frame['w'], h=frame['h']))
        (ROOT / 'web/characters/frame-map.json').write_text(json.dumps(mapping, separators=(',', ':')) + '\n')
        print(len(mapping), 'frame bindings')
        raise SystemExit
    traces = [json.loads((STUDY / file).read_text()) for file in
              ('pose-trace.json', 'loss-pose-trace.json')]
    selected = {}
    for c, name in enumerate(('pl11', 'pl16')):
        source = frames(name)
        counts = Counter(frame[c] for trace in traces for frame in trace)
        poses = []
        for cg, count in counts.most_common():
            if cg not in source:
                continue
            if not poses or max(similarity(source[cg], source[p]) for p in poses) < .81:
                poses.append(cg)
        poses.sort()
        selected[name] = poses
        print(name, len(counts), 'observed frames;', len(poses), 'distinct illustrated poses')
    (ROOT / 'web/characters/poses.json').write_text(json.dumps(selected, indent=2) + '\n')
