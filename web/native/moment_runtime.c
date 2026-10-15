/* Scene initialization only. Player movement, collisions, parries and damage stay in 3SX. */
#include "moment_runtime.h"
#include "character_renderer.h"
#include "main.h"
#include "constants.h"
#include "sf33rd/Source/Common/PPGWork.h"
#include "sf33rd/Source/Game/engine/charid.h"
#include "sf33rd/Source/Game/engine/plcnt.h"
#include "sf33rd/Source/Game/engine/slowf.h"
#include "sf33rd/Source/Game/engine/workuser.h"
#include "sf33rd/Source/Game/effect/effect.h"
#include "sf33rd/Source/Game/effect/eff84.h"
#include "sf33rd/Source/Game/io/gd3rd.h"
#include "sf33rd/Source/Game/io/pulpul.h"
#include "sf33rd/Source/Game/menu/dir_data.h"
#include "sf33rd/Source/Game/rendering/aboutspr.h"
#include "sf33rd/Source/Game/rendering/color3rd.h"
#include "sf33rd/Source/Game/rendering/texcash.h"
#include "sf33rd/Source/Game/rendering/texgroup.h"
#include "sf33rd/Source/Game/rendering/mmtmcnt.h"
#include "sf33rd/Source/Game/rendering/mtrans.h"
#include "sf33rd/Source/Game/stage/bg.h"
#include "sf33rd/Source/Game/stage/bg_sub.h"
#include "sf33rd/Source/Game/system/sys_sub.h"
#include "sf33rd/Source/Game/system/sys_sub2.h"
#include "sf33rd/Source/Game/system/sysdir.h"
#include "sf33rd/Source/Game/system/work_sys.h"
#include "sf33rd/Source/Game/ui/sc_sub.h"
#include <string.h>
extern void Game2_0(void),Game2_1(void),Game01_Sub(void),pli_0000(void),Check_Stage_BGM(void);
static int load_phase,ready;
void Moment_InitGame(void) {
    init_texcash_1st();
    Init_texgrplds_work();
    copy_char_base_data();
    load_any_color(0x9C,0x18);
    load_any_color(0x9D,0x1F);
    load_any_color(0x14,2);
    load_any_texture_patnum(0x72A0,0xF,0);
    load_any_texture_patnum(0x7F30,0xC,0);
    dmwk_kage.my_mts=0x11;dmwk_kage.current_colcd=0x1FF;
    dmwk_kage.my_clear_level=0x90;dmwk_kage.work_id=dmwk_moji.work_id=0x10;
    Pause_Family_On();Bg_TexInit();Scrscreen_Init();effect_work_init();
    Max_vitality=160;DE_X[0]=2;DE_X[1]=27;
    Setup_Default_Game_Option();Copy_Save_w();
    for(int i=0;i<6;i++){
        system_dir[i]=Dir_Default_Data;
        Vital_Handicap[i][0]=Vital_Handicap[i][1]=7;
    }
    Mode_Type=MODE_VERSUS;Present_Mode=PRESENT_MODE_LOCAL;Play_Type=1;Demo_Flag=1;
    My_char[0]=CHAR_KEN;My_char[1]=CHAR_CHUNLI;
    Player_Color[0]=5;Player_Color[1]=0;Super_Arts[0]=2;Super_Arts[1]=1;
    Operator_Status[0]=Operator_Status[1]=1;
    plw[0].wu.operator=plw[1].wu.operator=1;
    save_w[1].Partner_Type[0]=save_w[1].Partner_Type[1]=0;
    G_No[0]=G_No[1]=2;G_No[2]=0;
    bg_w.stage=STAGE_3S_KEN;bg_w.area=0;VS_Stage=STAGE_3S_KEN;
    init_pulpul_work();Init_Load_Request_Queue();init_omop();set_hitmark_color();
    Push_LDREQ_Queue_Player(0,CHAR_KEN);Push_LDREQ_Queue_Player(1,CHAR_CHUNLI);
    Push_LDREQ_Queue_BG(STAGE_3S_KEN);
    load_phase=0;ready=0;
}
int Moment_Ready(void){return ready;}
void Moment_RunGameFrame(void) {
    if(load_phase==0){
        Check_LDREQ_Queue();
        if(!Check_LDREQ_Clear())return;
        Make_texcash_of_list(3);
        Game01_Sub();
        Game2_0();
        pli_0000();
        appear_type=APPEAR_TYPE_NON_ANIMATED;pcon_rno[1]=0;
        C_No[0]=2;C_No[1]=C_No[2]=C_No[3]=0;
        G_No[2]=1;Allow_a_battle_f=1;Disp_Cockpit=1;
        Round_Operator[0]=Round_Operator[1]=1;Round_num=2;
        effect_84_init();Check_Stage_BGM();
        load_phase=1;
    }
    mpp_w.inGame=true;Play_Game=1;system_timer++;
    init_color_trans_req();init_texcash_before_process();seqsBeforeProcess();Moment_CharacterBeginFrame();
    Game2_1();BG_move_Ex(3);
    seqsAfterProcess();texture_cash_update();move_pulpul_work();
    if(pcon_rno[0]==1&&plw[0].wu.routine_no[1]==0&&plw[1].wu.routine_no[1]==0&&bg_w.bg_routine==3)ready=1;
}
/* Scene-only build has no route back to a title screen. */
void Next_Title_Sub(void) {}
