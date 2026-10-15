#ifndef MOMENT_CHARACTER_RENDERER_H
#define MOMENT_CHARACTER_RENDERER_H

#include "structs.h"
#include "core/render_primitives.h"
/* Mirrors the private draw-list layout in the unchanged 3SX mtrans.c. */
typedef struct {
    Sprite2* chip;
    u16 sprTotal, sprMax;
    s8 up[24];
} SpriteChipSet;
extern SpriteChipSet seqs_w;
extern s32 curr_bright;

/* Artwork only. These hooks never write to player or combat state. */
void Moment_CharacterBeginFrame(void);
void Moment_CharacterQueued(WORK* work, int first_chip, int last_chip);
/* Bracket native portrait/name draw calls; preserve both variants for replay. */
void Moment_HudBegin(int part);
void Moment_HudEnd(void);

#endif
