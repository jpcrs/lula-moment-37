"""Plan a separate replacement for every native drawing used by either fighter.

Only byte-identical native drawings can share an asset. Similar silhouettes,
neighboring frame numbers, and bounding-box similarity never create aliases.
"""
import json
import hashlib
import struct
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
catalog = json.loads((ROOT / 'web/characters/native-animations.json').read_text())
plan = {'sheets': [], 'aliases': {}, 'graphics': {}, 'identity': {'pl11': 'hat-reference.png', 'pl16': 'gray-reference.png'}}
plan['preservedEffects'] = list(range(15648, 15659))  # Ken's native fire trails have no costume/face to replace.
plan['preservedEffects'] += [cg for cg in range(20992, 21089) if cg != 21074]  # Abstract Chun-Li energy/trail graphics; 21074 includes her body.
for name, data in catalog.items():
    seen = {}
    unique = []
    for fr in data['graphics']:
        if not fr.get('uses'):
            continue
        key = (fr['w'], fr['h'], fr['pixelHash'])
        if key in seen:
            plan['aliases'][str(fr['cg'])] = seen[key]
        else:
            seen[key] = fr['cg']
            unique.append(fr['cg'])
        plan['graphics'][str(fr['cg'])] = fr
    # Include non-script graphics too: overlap pieces and direct damage
    # poses can be selected by native C code rather than a charset record.
    extra = []
    for fr in data['graphics']:
        if str(fr['cg']) in plan['graphics']:
            continue
        key = (fr['w'], fr['h'], fr['pixelHash'])
        if key in seen:
            plan['aliases'][str(fr['cg'])] = seen[key]
        else:
            seen[key] = fr['cg']
            extra.append(fr['cg'])
        plan['graphics'][str(fr['cg'])] = fr
    for i in range(0, len(extra), 16):
        plan['sheets'].append({'name': name, 'file': f'{name}-extra-{i//16:03}.png',
                               'guide': f'outputs/character-audit/guides/{name}-extra-{i//16:03}.png',
                               'cols': 4, 'rows': 4, 'cgs': extra[i:i+16]})
    if name == 'pl11':
        plan['sheets'].append({'name': name, 'file': 'ken-roll.png', 'guide': 'outputs/character-audit/ken-roll-guide.png',
                               'cols': 4, 'rows': 3, 'cgs': list(range(14732,14744))})
        unique = [cg for cg in unique if cg not in range(14732,14744)]
    for i in range(0, len(unique), 16):
        plan['sheets'].append({'name': name, 'file': f'{name}-{i//16:03}.png',
                               'guide': f'outputs/character-audit/guides/{name}-{i//16:03}.png',
                               'cols': 4, 'rows': 4, 'cgs': unique[i:i+16]})
(ROOT / 'web/characters/native-redraw-plan.json').write_text(json.dumps(plan, indent=2)+'\n')
# Small reference hashes let browser tests verify preserved fire pixels without
# requiring the ignored extraction files or decoding Aseprite source projects.
blob=(ROOT/'outputs/character-study/pl11-frames.bin').read_bytes()
palette=[]
for c in struct.unpack_from('<64H',blob,8):
    palette.append(bytes((((c>>10)&31)*255//31,((c>>5)&31)*255//31,(c&31)*255//31,255)))
palette[0]=bytes(4)
effects=[];pos=136
for _ in range(struct.unpack_from('<I',blob,4)[0]):
    cg,w,h,x,y,size=struct.unpack_from('<HHHhhI',blob,pos);pos+=14
    if cg in plan['preservedEffects']:
        rgba=b''.join(palette[c] for c in blob[pos:pos+size])
        effects.append({'cg':cg,'w':w,'h':h,'sha256Rgba':hashlib.sha256(rgba).hexdigest()})
    pos+=size
(ROOT/'web/characters/native-effects.json').write_text(json.dumps(effects,indent=2)+'\n')
print(len(plan['sheets']), 'sheets;', len(plan['graphics']), 'native frame IDs;', len(plan['aliases']), 'byte-identical aliases')
