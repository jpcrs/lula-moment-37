/* Evo Moment 37 adapter with a ten-frame forward-tap rule; original combat resolves contacts. */
#include "main.h"
#include "moment_runtime.h"
#include "sf33rd/Source/Game/rendering/texcash.h"
#include "sf33rd/Source/Game/stage/bg.h"
#include "sf33rd/Source/Game/ui/sc_sub.h"
#include "constants.h"
#include "platform/netplay/game_state.h"
#include "platform/video/sdl_generic/sdl_generic_renderer.h"
#include "port/io/resource.h"
#include "sf33rd/AcrSDK/common/pad.h"
#include "sf33rd/AcrSDK/common/mlPAD.h"
#include "sf33rd/AcrSDK/ps2/ps2PAD.h"
#include "sf33rd/Source/Game/io/ioconv.h"
#include "sf33rd/Source/Game/engine/spgauge.h"
#include "sf33rd/Source/Game/engine/plcnt.h"
#include "sf33rd/Source/Game/engine/workuser.h"
#include "sf33rd/Source/Game/effect/effect.h"
#include "sf33rd/Source/Game/system/work_sys.h"
#include "sf33rd/Source/Game/ui/count.h"
#include "sf33rd/Source/Game/engine/vital.h"
#include "sf33rd/Source/Game/rendering/color3rd.h"
#include <SDL3/SDL.h>
#include <emscripten.h>
#include <string.h>
extern void web_input(int id,int bits);
static int phase, boot_frame, run_frame, status;
static int achieved_parries, end_frames, end_result;
static int chun_super_frame=-1,audio_frame;
static int evo_failed,evo_kicks,evo_kick_parries,evo_kick_parried;
static u16 evo_attack_id;
static int finish_hits,finish_trace[16][8],finish_stage,finish_failed,finish_cancels,final_parry_air;
enum { PARRY_WINDOW=10 };
static int parry_tap=-1000,parry_air,previous_direction;
static GameState checkpoint;
static unsigned char effects[sizeof(frw)];
static short effect_heads[8],effect_tails[8],effect_queue[EFFECT_MAX],effect_exec[8];
static short effect_count,effect_min;
static BG_POS bg_checkpoint[8];
static FM_POS fm_checkpoint[8];
static FLPAD pad_checkpoint[2][2];
static TARPAD target_pad_checkpoint[2];
static IO io_checkpoint;
static u16 colors_checkpoint[512][64];
static u32 interrupt_checkpoint;
static u16 screen_checkpoint,screen_buffer_checkpoint;
static BackgroundParameters bg_parameters_checkpoint[8];
static SAFrame hud_checkpoint[3][48];
static int saved;
static SDL_Window* game_window;
int web_skip_render;
EMSCRIPTEN_KEEPALIVE void web_render(int enabled) {web_skip_render=!enabled;}

static void frame(void) {
 Resource_RunServer(); Main_StepFrame(); Main_FinishFrame();
 int width,height;SDL_GetWindowSizeInPixels(game_window,&width,&height);
 SDLGenericRenderer_RenderFrame((SDL_Rect){0,0,width,height});
}
static void capture(void) {
 GameState_Save(&checkpoint);
 memcpy(effects,frw,sizeof(frw)); memcpy(effect_heads,head_ix,sizeof(head_ix));
 memcpy(effect_tails,tail_ix,sizeof(tail_ix)); memcpy(effect_queue,frwque,sizeof(frwque));
 memcpy(effect_exec,exec_tm,sizeof(exec_tm));effect_count=frwctr;effect_min=frwctr_min;
 memcpy(bg_checkpoint,bg_pos,sizeof(bg_pos));memcpy(fm_checkpoint,fm_pos,sizeof(fm_pos));
 for(int i=0;i<2;i++)memcpy(pad_checkpoint[i],flpad_adr[i],sizeof(pad_checkpoint[i]));
 memcpy(target_pad_checkpoint,tarpad_root,sizeof(tarpad_root));io_checkpoint=io_w;interrupt_checkpoint=Interrupt_Timer;
 memcpy(colors_checkpoint,ColorRAM,sizeof(ColorRAM));
 screen_checkpoint=Screen_Switch;screen_buffer_checkpoint=Screen_Switch_Buffer;
 memcpy(bg_parameters_checkpoint,bg_prm,sizeof(bg_prm));memcpy(hud_checkpoint,sa_frame,sizeof(sa_frame));
 saved=1;
}
EMSCRIPTEN_KEEPALIVE void web_reset(void) {
 if(!saved)return;
 GameState_Load(&checkpoint);
 // The saved zoom value does not include the renderer's cached scale.
 Zoom_Value_Set(checkpoint.zoom_add);
 memcpy(frw,effects,sizeof(frw));memcpy(head_ix,effect_heads,sizeof(head_ix));
 memcpy(tail_ix,effect_tails,sizeof(tail_ix));memcpy(frwque,effect_queue,sizeof(frwque));
 memcpy(exec_tm,effect_exec,sizeof(exec_tm));frwctr=effect_count;frwctr_min=effect_min;
 memcpy(bg_pos,bg_checkpoint,sizeof(bg_pos));memcpy(fm_pos,fm_checkpoint,sizeof(fm_pos));
 for(int i=0;i<2;i++)memcpy(flpad_adr[i],pad_checkpoint[i],sizeof(pad_checkpoint[i]));
 memcpy(tarpad_root,target_pad_checkpoint,sizeof(tarpad_root));io_w=io_checkpoint;Interrupt_Timer=interrupt_checkpoint;
 memcpy(ColorRAM,colors_checkpoint,sizeof(ColorRAM));
 Screen_Switch=screen_checkpoint;Screen_Switch_Buffer=screen_buffer_checkpoint;
 memcpy(bg_prm,bg_parameters_checkpoint,sizeof(bg_prm));memcpy(sa_frame,hud_checkpoint,sizeof(sa_frame));
 Clear_texcash_work();
 p1sw_0=p1sw_1=p2sw_0=p2sw_1=p1sw_buff=p2sw_buff=0;
 web_input(0,0);web_input(1,0);run_frame=0;audio_frame=0;chun_super_frame=-1;achieved_parries=0;end_frames=end_result=0;status=1;
 evo_failed=evo_kicks=evo_kick_parries=evo_kick_parried=0;evo_attack_id=0;
 parry_tap=-1000;parry_air=previous_direction=0;
 finish_hits=finish_stage=finish_failed=finish_cancels=final_parry_air=0;memset(finish_trace,0,sizeof(finish_trace));
}
void Moment_RecordFinishHit(PLW* attacker,PLW* defender) {
 if(status!=2||attacker!=&plw[0]||defender!=&plw[1]||finish_hits>=16)return;
 int* trace=finish_trace[finish_hits++];
 trace[0]=run_frame;trace[1]=attacker->wu.kind_of_waza;trace[2]=attacker->wu.routine_no[2];
 trace[3]=attacker->wu.char_index;trace[4]=attacker->cp->lgp;trace[5]=defender->cb->total;
 trace[6]=attacker->wu.xyz[1].disp.pos;trace[7]=attacker->wu.pat_status;
 // Observe the original confirmed-hit/combo bookkeeping. These checks never
 // supply attacks, alter damage, or extend the engine's cancel windows.
 if(finish_failed)return;
 if(achieved_parries!=15||!final_parry_air||defender->cb->total!=finish_hits){finish_failed=1;return;}
 int move=attacker->wu.routine_no[2],kind=attacker->wu.kind_of_waza;
 if(finish_stage==0&&finish_hits==1&&kind==5&&move==3&&attacker->wu.pat_status==20&&trace[6]>0)finish_stage=1;
 else if(finish_stage==1&&finish_hits==2&&kind==3&&move==0&&attacker->wu.pat_status==32)finish_stage=2;
 else if(finish_stage==2&&finish_hits==3&&kind==10&&move==17&&(finish_cancels&1))finish_stage=3;
 else if(finish_stage==3&&finish_hits==4&&kind==37&&move==21&&finish_cancels==3)finish_stage=4;
 else if(finish_stage==4&&finish_hits<=12&&kind==37&&move==21){}
 else finish_failed=1;
}
// Challenge rule: one fresh forward tap arms ten simulation frames, including
// super freeze and air parries. The original collision/defense code consumes it.
static void record_parry_tap(int bits) {
 int direction=bits&15,forward=plw[0].wu.rl_flag?SWK_RIGHT:SWK_LEFT;
 int pulse=(bits>>16)&15;
 if((direction==forward&&previous_direction==0)||pulse==forward) {
  parry_tap=run_frame;parry_air=plw[0].wu.xyz[1].disp.pos>0;
 }
 if(direction&&direction!=forward)parry_tap=-1000;
 previous_direction=direction;
}
void Moment_ApplyParryWindow(PLW* defender) {
 if(defender!=&plw[0]||status!=2||achieved_parries>=15||
    plw[1].wu.routine_no[1]!=4||plw[1].wu.routine_no[2]!=20)return;
 int remaining=PARRY_WINDOW-(run_frame-parry_tap);
 defender->cp->waza_flag[3]=defender->cp->waza_flag[5]=0;
 if(remaining>0&&remaining<=PARRY_WINDOW&&
    parry_air==(defender->wu.xyz[1].disp.pos>0))
  defender->cp->waza_flag[parry_air?5:3]=remaining;
}
static void setup_challenge(void) {
 // Match the subway camera and wide, right-facing approach in the official footage.
 bg_w.bgw[1].xy[0].cal=bg_w.bgw[1].wxy[0].cal=450<<16;
 bg_w.bgw[1].chase_xy[0].cal=bg_w.bgw[1].hos_xy[0].cal=450<<16;
 bg_w.bgw[1].old_pos_x=450;
 plw[0].wu.xyz[0].cal=576<<16;plw[1].wu.xyz[0].cal=333<<16;
 plw[0].wu.position_x=plw[0].wu.scr_mv_x=576;plw[1].wu.position_x=plw[1].wu.scr_mv_x=333;
 plw[0].wu.rl_flag=plw[0].wu.rl_waza=0;plw[1].wu.rl_flag=plw[1].wu.rl_waza=1;
 plw[0].wu.vital_new=plw[0].wu.vital_old=1;
 // Leave enough health for all twelve connected hits of Daigo's finish.
 plw[1].wu.vital_new=plw[1].wu.vital_old=60;
 vit[0].cyerw=vit[0].cred=vit[0].ored=1;vit[0].colnum=3;
 vit[1].cyerw=vit[1].cred=vit[1].ored=60;vit[1].colnum=2;
 for(int i=0;i<2;i++) {
  super_arts[i].store=1;super_arts[i].gauge.i=0;super_arts[i].ok=1;
  spg_dat[i].spg_level=1;sa_stock_trans(1,0,i);
 }
 Counter_hi=26;Counter_low=53;round_timer=26;math_counter_hi=2;math_counter_low=6;
 Timer_Freeze=0;PL_Wins[0]=PL_Wins[1]=1;
 Score[0][0]=Score[0][1]=34500;Score[1][0]=Score[1][1]=107000;
 paring_ctr_vs[1][0]=0;paring_ctr_vs[1][1]=0;
 cpExitTask(TASK_PAUSE);cpExitTask(TASK_ENTRY);
 web_input(0,0);web_input(1,0);
 for(int i=0;i<2;i++)frame();
 Counter_hi=26;Counter_low=53;round_timer=26;math_counter_hi=2;math_counter_low=6;
 frame();
 capture();status=1;
 SDL_Log("Moment37 ready: %d / %d, SA %d / %d",My_char[0],My_char[1],Super_Arts[0],Super_Arts[1]);
}
EMSCRIPTEN_KEEPALIVE int web_init(void) {
 if(!SDL_Init(SDL_INIT_VIDEO|SDL_INIT_AUDIO|SDL_INIT_GAMEPAD))return 0;
 game_window=SDLGenericRenderer_Init(&(SDLRenderBackendInitInfo){.app_name="Moment 37",.window_width=768,.window_height=576});
 if(!game_window)return 0;
 if(!Resource_Init("/SF33RD.AFS",1024*1024))return 0;
 Main_Init();phase=0;status=0;return 1;
}
EMSCRIPTEN_KEEPALIVE void web_start(void) {if(saved)status=2;}
EMSCRIPTEN_KEEPALIVE int web_status(void) {return status;}
/* Read-only animation diagnostics for comparing artwork to the native VM. */
EMSCRIPTEN_KEEPALIVE int web_animation(int player,int key) {
 if(player<0||player>1)return 0;
 const WORK* w=&plw[player].wu;
 switch(key){
  case 0:return w->now_koc;case 1:return w->char_index;
  case 2:return w->cgd_type?w->cg_ix/w->cgd_type+1:0;
  case 3:return w->cg_ctr;case 4:return w->cg_flip;case 5:return w->cg_number;
  case 6:return w->xyz[0].disp.pos;case 7:return w->xyz[1].disp.pos;
  case 8:return w->rl_flag;case 9:return w->cg_type;
  case 10:return w->cg_next_ix;case 11:return w->cgd_type;
 }
 return 0;
}
static int evo_optional_kick(void) {
 // These two kicks naturally miss at the reference spacing after parry pushback.
 return evo_kicks==5||evo_kicks==13;
}
static void check_evo_sequence(int previous_parries) {
 if(evo_failed||chun_super_frame<0)return;
 if(plw[0].wu.vital_new<1||end_result==3){evo_failed=1;return;}
 if(achieved_parries>=15)return;
 if(plw[1].wu.routine_no[1]!=4||plw[1].wu.routine_no[2]!=20){evo_failed=1;return;}
 u16 attack_id=plw[1].wu.attack_num;
 if(attack_id&&attack_id!=evo_attack_id){
  if(evo_kicks&&!evo_optional_kick()&&!evo_kick_parried){evo_failed=1;return;}
  evo_attack_id=attack_id;evo_kicks++;evo_kick_parries=previous_parries;evo_kick_parried=0;
 }
 if(!evo_kicks)return;
 if(achieved_parries>evo_kick_parries)evo_kick_parried=1;
 // A hit or block consumes the attack without a successful parry.
 if(!plw[1].wu.att_hit_ok&&!evo_kick_parried){evo_failed=1;return;}
 // A connecting kick's active window ended without a parry (escape or dodge).
 if(!plw[1].wu.cg_att_ix&&!evo_optional_kick()&&!evo_kick_parried)evo_failed=1;
}
EMSCRIPTEN_KEEPALIVE void web_step(int bits) {
 if(phase<5) {
  web_input(0,0);web_input(1,0);frame();boot_frame++;
  if(Moment_Ready()){phase=5;setup_challenge();}
  return;
 }
 if(status!=2)return;
 if(end_frames) {
  web_input(0,0);web_input(1,0);frame();audio_frame++;
  if(--end_frames==0)status=end_result;
  return;
 }
 record_parry_tap(bits);web_input(0,bits&0xffff);
 // Two quarter circles toward Ken, then kick: original Houyoku-sen command.
 int t=run_frame-90,b=0;
 if(t>=0&&t<2)b=SWK_DOWN;
 else if(t<4&&t>=2)b=SWK_DOWN|SWK_RIGHT;
 else if(t<6&&t>=4)b=SWK_RIGHT;
 else if(t<8&&t>=6)b=SWK_DOWN;
 else if(t<10&&t>=8)b=SWK_DOWN|SWK_RIGHT;
 else if(t<12&&t>=10)b=SWK_RIGHT|SWK_SOUTH;
 int previous_parries=achieved_parries,previous_move=plw[0].wu.routine_no[2],previous_routine=plw[0].wu.routine_no[1];
 web_input(1,b);frame();run_frame++;audio_frame++;
 if(previous_routine==4&&plw[0].wu.routine_no[1]==4){
  if(finish_stage==2&&previous_move==0&&plw[0].wu.routine_no[2]==17)finish_cancels|=1;
  if(finish_stage==3&&previous_move==17&&plw[0].wu.routine_no[2]==21)finish_cancels|=2;
 }
 if(chun_super_frame<0&&plw[1].wu.routine_no[1]==4&&plw[1].wu.routine_no[2]==20)chun_super_frame=run_frame-1;
 if(paring_ctr_vs[1][0]>achieved_parries){achieved_parries=paring_ctr_vs[1][0];parry_tap=-1000;if(achieved_parries==15){final_parry_air=plw[0].wu.xyz[1].disp.pos>0;if(!final_parry_air)finish_failed=1;}}
 if(finish_stage>0&&finish_hits<12&&!plw[1].cb->total)finish_failed=1;
 if(plw[0].wu.vital_new<0)end_result=3;
 else if(plw[1].wu.vital_new<0)end_result=achieved_parries==15&&final_parry_air&&finish_stage==4&&finish_hits==12&&!finish_failed?4:3;
 else if(finish_failed)end_result=3;
 else if(run_frame>1200)end_result=3;
 check_evo_sequence(previous_parries);
 if(end_result)end_frames=72;
}
EMSCRIPTEN_KEEPALIVE int web_value(int key) {
 if(key==100)return finish_hits;
 if(key>=101&&key<229)return finish_trace[(key-101)/8][(key-101)%8];
 switch(key) {
 case 64:return plw[0].wu.cg_number;case 65:return plw[1].wu.cg_number;
 case 59:return finish_stage;case 60:return finish_failed;case 61:return finish_hits;
 case 62:return finish_cancels;case 63:return final_parry_air;
 case 56:return parry_tap>=0&&run_frame-parry_tap<PARRY_WINDOW?PARRY_WINDOW-(run_frame-parry_tap):0;
 case 57:return parry_tap;case 58:return PARRY_WINDOW;
 case 54:return evo_failed;case 55:return evo_kicks;
 case 52:return chun_super_frame;case 53:return audio_frame;
 case 0:return boot_frame;case 1:return phase;case 2:return run_frame;
 case 3:return plw[0].wu.vital_new;case 4:return plw[1].wu.vital_new;
 case 5:return achieved_parries;case 6:return plw[0].wu.xyz[0].disp.pos;
 case 7:return plw[1].wu.xyz[0].disp.pos;case 8:return plw[1].wu.routine_no[1];
 case 9:return plw[1].wu.cg_ix;case 10:return Allow_a_battle_f;
 case 11:return C_No[0];case 12:return plw[0].wu.routine_no[1];
 case 13:return plw[0].wu.xyz[1].disp.pos;case 14:return plw[1].sa->store;
 case 15:return plw[1].cp->sw_lvbt;case 16:return G_No[1];
 case 17:return plw[0].wu.rl_flag;case 18:return plw[1].wu.rl_flag;
 case 19:return My_char[0];case 20:return My_char[1];case 21:return Super_Arts[0];case 22:return Super_Arts[1];case 23:return bg_w.stage;
 case 24:return Player_Color[0];case 25:return Player_Color[1];
 case 26:return plw[1].wu.routine_no[2];case 27:return plw[0].wu.routine_no[2];case 28:return plw[1].wu.cg_att_ix;
 case 46:return bg_w.bgw[1].xy[0].disp.pos;case 47:return plw[0].wu.position_x-bg_w.bgw[1].xy[0].disp.pos+192;case 48:return plw[1].wu.position_x-bg_w.bgw[1].xy[0].disp.pos+192;case 49:return bg_w.bgw[1].r_limit2;case 50:return Screen_Switch;case 51:return bg_w.bgw[1].l_limit2;case 41:return plw[0].sa->store;case 42:return plw[0].sa->ok;case 43:return plw[0].sa->gauge.i;case 44:return plw[0].wu.kind_of_waza;case 45:return plw[0].sa->mp;case 40:return end_result;case 32:return plw[0].cp->waza_flag[3];case 33:return plw[0].cp->waza_flag[4];case 34:return plw[0].wu.dm_stop;case 35:return plw[0].spmv_ng_flag;case 36:return plw[0].wu.rl_waza;case 37:return plw[0].cp->sw_now;case 38:return plw[0].wu.cg_ix;case 39:return plw[1].wu.hit_stop;case 29:return Play_Type;case 30:return paring_ctr_vs[0][0];case 31:return plw[0].cp->sw_lvbt;
 }return 0;
}
