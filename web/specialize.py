"""Generate a scene-only host entry from 3SX's original functions.

Fight routines are copied verbatim; menu/title/selection dispatch is not included.
Generated files remain reviewable in web/build/generated. The 3sx checkout is untouched.
"""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'web/build/generated';OUT.mkdir(parents=True,exist_ok=True)
def function(source,name):
    match=re.search(r'^(?:static )?(?:void|bool|s32|s16|Language) '+name+r'\([^\n]*\) \{',source,re.M)
    if not match:raise ValueError(name)
    start=match.start();pos=match.end();depth=1
    while depth:
        if source[pos]=='{':depth+=1
        if source[pos]=='}':depth-=1
        pos+=1
    return source[start:pos]
def replace(source,name,new):return source.replace(function(source,name),new)
main=(ROOT/'3sx/src/main.c').read_text()
main=main.replace('#include "main.h"','#include "main.h"\n#include "moment_runtime.h"')
main=main.replace('    Arcade_Init();','').replace('    Arcade_Finish();','')
main=main.replace('    cpReadyTask(TASK_INIT, Init_Task);','')
main=main.replace('    appSetupBasePriority();','    appSetupBasePriority();\n    Moment_InitGame();')
main=replace(main,'Get_Default_Language','Language Get_Default_Language() { return LANG_ENGLISH; }')
main=replace(main,'njUserMain','void njUserMain() { Moment_RunGameFrame(); }')
(OUT/'main_scene.c').write_text(main)
game=(ROOT/'3sx/src/sf33rd/Source/Game/game.c').read_text()
includes='\n'.join(line for line in game.splitlines()if line.startswith('#include '))
source='/* Generated: original gameplay functions only. */\n'+includes+'\n#include "moment_runtime.h"\nvoid Time_Control();\nstatic bool should_render_input_history() { return false; }\n'
for name in ('Game2_0','Game2_1','Game01_Sub','Time_Control'):source+='\n'+function(game,name)+'\n'
source+='\nvoid Game_Task(struct _TASK* task) { Moment_RunGameFrame(); }\n'
(OUT/'game_scene.c').write_text(source)
# Keep fixed character and stage dispatch entries at their original numeric indices.
pat=(ROOT/'3sx/src/sf33rd/Source/Game/engine/plpat.c').read_text()
pat=re.sub(r'void \(\*const plxx_extra_attack_table\[\]\)\(PLW\*\) = \{.*?\n\};',
 'void (*const plxx_extra_attack_table[20])(PLW*) = { [11] = pl11_extra_attack, [15] = pl16_extra_attack };',pat,flags=re.S)
assert '[11] = pl11_extra_attack, [15] = pl16_extra_attack' in pat
(OUT/'plpat_scene.c').write_text(pat)
# The challenge has one explicit rule override: a ten-frame forward-tap window.
# Keep the original hitboxes, defense decisions and parry effects; synchronize
# their command timer immediately before they examine it, even during freeze.
hitcheck=(ROOT/'3sx/src/sf33rd/Source/Game/engine/hitcheck.c').read_text()
hitcheck='#include "moment_runtime.h"\n'+hitcheck
for name in ('defense_ground_ps2','defense_sky_ps2'):
    original=function(hitcheck,name)
    hitcheck=hitcheck.replace(original,original.replace('{','{\n    Moment_ApplyParryWindow(ds);',1))
hitcheck=hitcheck.replace('    add_combo_work(as, ds);', '    add_combo_work(as, ds);\n    Moment_RecordFinishHit(as, ds);',1)
(OUT/'hitcheck_scene.c').write_text(hitcheck)
stage=(ROOT/'3sx/src/sf33rd/Source/Game/stage/tate00.c').read_text()
stage=re.sub(r'void \(\*ta_move_tbl\[AREA_COUNT\]\)\(\) = \{.*?\n\};',
 'void (*ta_move_tbl[AREA_COUNT])() = { [AREA_3S_KEN] = BG010 };',stage,flags=re.S)
assert '[AREA_3S_KEN] = BG010 };' in stage
(OUT/'stage_scene.c').write_text(stage)
# The host handles pause and retry; these UI tasks are absent from the scene build.
source+='\nvoid Menu_Task(struct _TASK* task) {}\nvoid Pause_Task(struct _TASK* task) {}\n'
(OUT/'game_scene.c').write_text(source)

# Only the shared effects bank, Ken bank and Chun-Li bank are reachable.
sound=(ROOT/'3sx/src/sf33rd/Source/Game/sound/sound3rd.c').read_text()
for kind,ctype in [('TSB','SoundEvent*'),('PHD','s8*')]:
    sound=re.sub(r'(?:SoundEvent\*|s8\*) cse'+kind+r'DataTable\[21\] = \{.*?\};',
        ctype+' cse'+kind+'DataTable[21] = { [0] = '+kind+'_SE, [12] = '+kind+'_PL11, [16] = '+kind+'_PL15 };',sound,flags=re.S)
(OUT/'sound_scene.c').write_text(sound)

# Tag player draw requests for the optional character artwork. The original
# renderer still runs in full, keeping cache updates and priority calculations.
art=(ROOT/'3sx/src/sf33rd/Source/Game/rendering/aboutspr.c').read_text()
art='#include "character_renderer.h"\n#include "sf33rd/Source/Game/rendering/mtrans.h"\n'+art
original=function(art,'Mtrans_use_trans_mode')
hooked=original.replace('    switch (mts[wk->my_mts].mode) {',
    '    const int first_chip = seqs_w.sprTotal;\n    switch (mts[wk->my_mts].mode) {')
hooked=hooked[:-1]+'    Moment_CharacterQueued(wk, first_chip, seqs_w.sprTotal);\n}'
art=art.replace(original,hooked)
(OUT/'aboutspr_scene.c').write_text(art)

# Identify HUD artwork at its source instead of matching texture handles or
# screen coordinates. The rest of the native HUD, including gauges, is verbatim.
hud=(ROOT/'3sx/src/sf33rd/Source/Game/ui/sc_sub.c').read_text()
hud='#include "character_renderer.h"\n'+hud
for name,call,parts in [('player_name','scfont_sqput',[3,4]),('player_face','scfont_sqput_face',[1,2,2])]:
    original=function(hud,name)
    calls=list(re.finditer(r'    '+call+r'\([\s\S]*?\);',original))
    assert len(calls)==len(parts), (name,len(calls))
    hooked=original
    for match,part in reversed(list(zip(calls,parts))):
        replacement=f'    Moment_HudBegin({part});\n'+match.group()+ '\n    Moment_HudEnd();'
        hooked=hooked[:match.start()]+replacement+hooked[match.end():]
    hud=hud.replace(original,hooked)
(OUT/'sc_sub_scene.c').write_text(hud)
