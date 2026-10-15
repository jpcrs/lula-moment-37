"""Lossless inventory of both native animation programs and replacement coverage.

The existing 3SX charset interpreter remains authoritative. Every script record,
including commands and conditional branches, is retained; this is not a guessed
list of poses or an alternative animation clock.
"""
import hashlib
import json
import re
import struct
from pathlib import Path
from extract import resource

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'outputs/character-audit'
OUT.mkdir(parents=True, exist_ok=True)
FIELDS = ('nmca', 'dmca', 'btca', 'caca', 'cuca', 'atca', 'saca', 'exca', 'cbca', 'yuca',
          'stxy', 'mvxy', 'sernd', 'ovct', 'ovix', 'rict', 'hiit', 'boda', 'hana', 'cata', 'caua',
          'atta', 'hosa', 'atit', 'prot')
KOC = {'nmca': 0, 'dmca': 1, 'btca': 6, 'caca': 2, 'cuca': 3, 'atca': 4, 'saca': 5, 'exca': 7, 'cbca': 8, 'yuca': 9}
source = (ROOT / '3sx/src/sf33rd/Source/Game/engine/charset.c').read_text()
dispatch = source.split('CharCommandCallback const decode_chcmd[125] = {', 1)[1].split('};', 1)[0]
OPS = re.findall(r'\bcomm_\w+', dispatch)
assert len(OPS) == 125
NAMES = {0:'idle', 1:'turn', 2:'walk-forward', 3:'walk-backward', 4:'dash-forward', 5:'dash-backward',
         6:'crouch-start', 7:'crouching-idle', 8:'crouching-turn', 9:'crouching-walk-forward',
         10:'crouching-walk-backward', 11:'stand-up', 12:'jump-preparation', 13:'high-jump-preparation',
         14:'jump-forward', 15:'jump-neutral', 16:'jump-backward', 17:'jump-dispatch-forward',
         18:'jump-dispatch-neutral', 19:'jump-dispatch-backward', 20:'high-jump-forward',
         21:'high-jump-neutral', 22:'high-jump-backward', 23:'landing'}


def graphics(name):
    blob = (ROOT / 'outputs/character-study' / (name + '-frames.bin')).read_bytes()
    pos = 136
    frames = {}
    for _ in range(struct.unpack_from('<I', blob, 4)[0]):
        cg, w, h, x, y, size = struct.unpack_from('<HHHhhI', blob, pos)
        pos += 14
        pixels = blob[pos:pos+size]
        frames[cg] = {'cg': cg, 'x': x, 'y': y, 'w': w, 'h': h,
                      'pixelHash': hashlib.sha256(pixels).hexdigest(), 'visiblePixels': sum(c != 0 for c in pixels)}
        pos += size
    return frames


def catalogue(name, header):
    blob = resource(name + '.bin')
    locations = {field: header+offset for field, offset in zip(FIELDS, struct.unpack_from('<25i', blob, header))}
    gfx = graphics(name)
    scripts, tables = {}, []
    for field in FIELDS[:10]:
        start = locations[field]
        end = min([v for v in locations.values() if v > start] + [len(blob)])
        offsets = []
        while True:
            value = struct.unpack_from('<I', blob, start+len(offsets)*4)[0]
            if value == 0:
                break
            assert 8 <= value < end-start, (name, field, value)
            offsets.append(value)
        unique = sorted(set(offsets))
        for offset in unique:
            address = start+offset
            identity = f'{field}:{offset:x}'
            script_end = start+unique[unique.index(offset)+1]-8 if offset != unique[-1] else end
            width, status, kind, hit_range, parrying, attacks, tech = struct.unpack_from('<h6B', blob, address-8)
            assert width in (1, 2, 4, 6), (identity, width)
            stride = width*4
            records = []
            pos = address
            while pos < script_end:
                raw = blob[pos:min(pos+max(stride, 8), script_end)]
                code = struct.unpack_from('<H', raw)[0]
                record = {'pc': (pos-address)//stride+1, 'offset': pos, 'raw': raw[:stride].hex()}
                if code < 0x100:
                    assert code < len(OPS), (name, identity, pos, code)
                    _, koc, ix, pat = struct.unpack_from('<Hhhh', raw)
                    record.update(type='command', opcode=code, op=OPS[code], koc=koc, index=ix, pattern=pat)
                else:
                    se, overlap, cg = struct.unpack_from('<HHH', raw, 2)
                    record.update(type='frame', cg=cg, ticks=code>>8, cgType=code&255, flip=se&3,
                                  priority=(se&15)>>2, sound=se>>4, overlap=overlap)
                    if cg in gfx:
                        gfx[cg].setdefault('uses', []).append([identity, record['pc']])
                records.append(record)
                # The final control record can omit unused trailing words;
                # the next script's eight-byte header follows immediately.
                step = min(max(stride, 8), script_end-pos) if code < 0x100 else stride
                pos += step
            assert pos == script_end, (name, identity, pos, script_end)
            scripts[identity] = {'id': identity, 'field': field, 'koc': KOC[field], 'address': address,
                                 'strideWords': width, 'header': {'status': status, 'kind': kind, 'range': hit_range,
                                 'parrying': parrying, 'attacks': attacks, 'tech': tech}, 'records': records}
        for i, offset in enumerate(offsets):
            identity = f'{field}:{offset:x}'
            entry = {'koc': KOC[field], 'index': i, 'script': identity}
            if field == 'nmca' and i in NAMES:
                entry['label'] = NAMES[i]
            tables.append(entry)
    return {'source': name+'.bin', 'sourceHash': hashlib.sha256(blob).hexdigest(), 'tables': tables,
            'scripts': scripts, 'graphics': list(gfx.values())}


if __name__ == '__main__':
    result = {name: catalogue(name, header) for name, header in [('pl11', 0x17c0f8), ('pl16', 0x26c73c)]}
    destination = ROOT / 'web/characters/native-animations.json'
    destination.write_text(json.dumps(result, separators=(',', ':'))+'\n')
    authored = json.loads((OUT / 'authored.json').read_text()) if (OUT / 'authored.json').exists() else {}
    report = {}
    for name, data in result.items():
        frames = {f['cg']: f for f in data['graphics']}
        referenced = {r['cg'] for s in data['scripts'].values() for r in s['records'] if r['type'] == 'frame'}
        available = set(authored.get(name, []))
        own_referenced = referenced & set(frames)
        report[name] = {'scripts': len(data['scripts']), 'entryPoints': len(data['tables']),
                        'graphics': len(frames), 'referencedGraphics': len(own_referenced),
                        'authoredGraphics': len(available), 'missingReferencedGraphics': sorted(own_referenced-available),
                        'externalGraphics': sorted(referenced-set(frames)),
                        'missingGraphics': sorted(set(frames)-available)}
        print(name, {k: len(v) if isinstance(v,list) else v for k,v in report[name].items()})
    (OUT / 'coverage.json').write_text(json.dumps(report, indent=2)+'\n')
    print(destination)
