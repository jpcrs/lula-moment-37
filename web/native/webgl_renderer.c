/* Adapted from the 3SX OpenGL renderer for WebGL2 and optional character artwork. */
#if CRS_VIDEO_DRIVER_OPENGL

#include "platform/video/opengl/opengl_renderer.h"
#include "common.h"
#include "port/utils.h"
#include "sf33rd/AcrSDK/ps2/flps2etc.h"
#include "sf33rd/AcrSDK/ps2/flps2render.h"
#include "sf33rd/AcrSDK/ps2/foundaps2.h"

#include <GLES3/gl3.h>
#include "stb/stb_ds.h"
#include <SDL3/SDL.h>
#include <emscripten.h>
#include "character_renderer.h"
#include "sf33rd/Source/Game/engine/plcnt.h"
#include "sf33rd/Source/Game/rendering/mtrans.h"
#include "sf33rd/Source/Game/rendering/dc_ghost.h"
#include "sf33rd/Source/Game/rendering/color3rd.h"

#include <libgraph.h>

#define QUADS_MAX 1024

typedef enum GLPaletteType : Uint8 {
    PALETTE_NONE = 0,
    PALETTE_4,
    PALETTE_8,
} GLPaletteType;

typedef struct GLVec2 {
    float x;
    float y;
} GLVec2;

typedef struct GLVec3 {
    float x;
    float y;
    float z;
} GLVec3;

typedef struct GLTexCoord {
    float s;
    float t;
} GLTexCoord;

typedef struct GLColor {
    float r;
    float g;
    float b;
    float a;
} GLColor;

typedef struct GLVertex {
    GLVec3 position;
    GLTexCoord tex_coord;
    GLColor color;
} GLVertex;

typedef struct GLTexture {
    GLuint handle;
    Uint16 width;
    Uint16 height;
    GLPaletteType palette_type;
} GLTexture;

typedef struct GLTextureSpec {
    GLTexture texture;
    GLuint palette;
} GLTextureSpec;

typedef struct GLQuad {
    GLVec2 positions[4];
    GLTexCoord tex_coords[4];
    float z;
    Uint32 index;
    GLTextureSpec texture_spec;
    GLColor color;
    GLColor character_tint;
    Uint8 character;
    Uint8 custom;
} GLQuad;

static SDL_Window* window = NULL;
static SDL_GLContext gl_context = NULL;

static GLuint canvas_fbo = 0;
static GLuint canvas_color_tex = 0;
static GLuint canvas_depth_tex = 0;

static GLuint solid_shader = 0;
static GLuint palette_4_shader = 0;
static GLuint palette_8_shader = 0;
static GLuint direct_shader = 0;
static GLint character_tint_location = -1;
static GLint direct_tint_location = -1;

static GLuint vertex_array = 0;
static GLuint vertex_buffer = 0;
static GLQuad* quads = NULL;
static GLVertex* vertices = NULL;

static GLTexture textures[FL_TEXTURE_MAX] = { 0 };
static GLuint palettes[FL_PALETTE_MAX] = { 0 };
static GLTextureSpec latest_texture_spec = { 0 };

typedef struct CharacterFrame {
    Uint16 page, x, y, width, height;
    float left, top, world_width, world_height;
    bool present;
} CharacterFrame;
static CharacterFrame character_frames[65536];
static GLTextureSpec character_pages[16];
static GLTextureSpec character_hud;
static int hud_part;
static Uint8 character_chips[QUADS_MAX];
static GLQuad last_quads[QUADS_MAX];
static int last_quad_count;
static bool original_game, replaying;
static void OpenGLRenderer_RenderFrame(SDL_Rect viewport);

static Uint16 read16(const Uint8* p) { return p[0] | (p[1] << 8); }
static Uint32 read32(const Uint8* p) { return read16(p) | ((Uint32)read16(p + 2) << 16); }

static bool load_characters(void) {
    size_t size;
    Uint8* manifest = SDL_LoadFile("/characters/suits.bin", &size);
    if (!manifest || size < 12 || SDL_memcmp(manifest, "M37H", 4)) {
        SDL_free(manifest);
        SDL_LogError(SDL_LOG_CATEGORY_RENDER, "Character atlas manifest is missing or invalid");
        return false;
    }
    const Uint32 count = read32(manifest + 4), pages = read32(manifest + 8);
    if (pages > SDL_arraysize(character_pages) || size != 12 + count * 20) {
        SDL_free(manifest);
        return false;
    }
    for (Uint32 i = 0; i < count; i++) {
        const Uint8* p = manifest + 12 + i * 20;
        CharacterFrame* frame = &character_frames[read16(p)];
        *frame = (CharacterFrame){.page=read16(p+2), .x=read16(p+4), .y=read16(p+6),
            .width=read16(p+8), .height=read16(p+10), .left=(Sint16)read16(p+12)/64.0f,
            .top=(Sint16)read16(p+14)/64.0f, .world_width=(Sint16)read16(p+16)/64.0f,
            .world_height=(Sint16)read16(p+18)/64.0f, .present=true};
        if (frame->page >= pages || frame->x + frame->width > 2048 || frame->y + frame->height > 2048) {
            SDL_free(manifest);
            return false;
        }
    }
    SDL_free(manifest);
    for (Uint32 page = 0; page < pages; page++) {
        char path[80];
        SDL_snprintf(path, sizeof(path), "/characters/suits-%u.png", page);
        SDL_Surface* source = SDL_LoadPNG(path);
        SDL_Surface* surface = source ? SDL_ConvertSurface(source, SDL_PIXELFORMAT_RGBA32) : NULL;
        SDL_DestroySurface(source);
        if (!surface) { SDL_LogError(SDL_LOG_CATEGORY_RENDER, "Could not load %s: %s", path, SDL_GetError()); return false; }
        // The custom artwork uses the same crisp pixel sampling as the game.
        GLTextureSpec* spec = &character_pages[page];
        glGenTextures(1, &spec->texture.handle);
        glBindTexture(GL_TEXTURE_2D, spec->texture.handle);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
        glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, surface->w, surface->h, 0, GL_RGBA, GL_UNSIGNED_BYTE, surface->pixels);
        spec->texture.width = surface->w; spec->texture.height = surface->h;
        spec->texture.palette_type = PALETTE_NONE;
        SDL_DestroySurface(surface);
    }
    SDL_Surface* source = SDL_LoadPNG("/characters/hud.png");
    SDL_Surface* surface = source ? SDL_ConvertSurface(source, SDL_PIXELFORMAT_RGBA32) : NULL;
    SDL_DestroySurface(source);
    if (!surface || surface->w != 128 || surface->h != 32) {
        SDL_DestroySurface(surface);
        SDL_LogError(SDL_LOG_CATEGORY_RENDER, "Character HUD atlas is missing or invalid");
        return false;
    }
    glGenTextures(1, &character_hud.texture.handle);
    glBindTexture(GL_TEXTURE_2D, character_hud.texture.handle);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, surface->w, surface->h, 0, GL_RGBA, GL_UNSIGNED_BYTE, surface->pixels);
    character_hud.texture.width = surface->w;
    character_hud.texture.height = surface->h;
    SDL_DestroySurface(surface);
    return true;
}

void Moment_CharacterBeginFrame(void) { SDL_zero(character_chips); }
void Moment_HudBegin(int part) { hud_part = part; }
void Moment_HudEnd(void) { hud_part = 0; }

EMSCRIPTEN_KEEPALIVE int web_original(int enabled) {
    original_game = enabled != 0;
    // Replay the last draw list, including both art variants, without a game tick.
    // This also updates the artwork immediately while paused or before Start.
    if (window && last_quad_count) {
        arrsetlen(quads, last_quad_count);
        SDL_memcpy(quads, last_quads, last_quad_count * sizeof(GLQuad));
        int width, height; SDL_GetWindowSizeInPixels(window, &width, &height);
        replaying = true;
        OpenGLRenderer_RenderFrame((SDL_Rect){0, 0, width, height});
        replaying = false;
    }
    return original_game;
}

static const char* read_shader(const char* filename) {
    const char* base_path = SDL_GetBasePath();
    char* full_path = NULL;
    SDL_asprintf(&full_path, "%s/shaders/opengl/%s", base_path, filename);

    SDL_IOStream* io = SDL_IOFromFile(full_path, "r");

    if (io == NULL) {
        SDL_Log("Failed to load OpenGL shader at %s: %s", full_path, SDL_GetError());
        SDL_free(full_path);
        return NULL;
    }

    const Sint64 size = SDL_GetIOSize(io);
    char* buf = SDL_malloc(size + 1);
    SDL_ReadIO(io, buf, size);
    buf[size] = '\0';
    SDL_CloseIO(io);
    SDL_free(full_path);
    return buf;
}

static GLuint build_shader_program(const char* vertex_shader_filename, const char* fragment_shader_filename) {
    char info_log[512];
    GLint success;

    // Vertex shader

    const char* vertex_shader_source = read_shader(vertex_shader_filename);
    if (vertex_shader_source == NULL) {
        return 0;
    }

    const GLuint vertex_shader = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vertex_shader, 1, &vertex_shader_source, NULL);
    glCompileShader(vertex_shader);
    SDL_free((void*)vertex_shader_source);

    glGetShaderiv(vertex_shader, GL_COMPILE_STATUS, &success);

    if (!success) {
        glGetShaderInfoLog(vertex_shader, sizeof(info_log), NULL, info_log);
        SDL_LogError(SDL_LOG_CATEGORY_RENDER, "Error creating vertex shader: %s", info_log);
        glDeleteShader(vertex_shader);
        return 0;
    }

    // Fragment shader

    const char* fragment_shader_source = read_shader(fragment_shader_filename);

    if (fragment_shader_source == NULL) {
        glDeleteShader(vertex_shader);
        return 0;
    }

    const GLuint fragment_shader = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fragment_shader, 1, &fragment_shader_source, NULL);
    glCompileShader(fragment_shader);
    SDL_free((void*)fragment_shader_source);

    glGetShaderiv(fragment_shader, GL_COMPILE_STATUS, &success);

    if (!success) {
        glGetShaderInfoLog(fragment_shader, sizeof(info_log), NULL, info_log);
        SDL_LogError(SDL_LOG_CATEGORY_RENDER, "Error creating fragment shader: %s", info_log);
        glDeleteShader(vertex_shader);
        glDeleteShader(fragment_shader);
        return 0;
    }

    // Link shaders

    const GLuint program = glCreateProgram();
    glAttachShader(program, vertex_shader);
    glAttachShader(program, fragment_shader);
    glLinkProgram(program);

    glGetProgramiv(program, GL_LINK_STATUS, &success);

    if (!success) {
        glGetProgramInfoLog(program, sizeof(info_log), NULL, info_log);
        SDL_LogError(SDL_LOG_CATEGORY_RENDER, "Error creating shader program: %s", info_log);
        glDeleteShader(vertex_shader);
        glDeleteShader(fragment_shader);
        glDeleteProgram(program);
        return 0;
    }

    glDeleteShader(vertex_shader);
    glDeleteShader(fragment_shader);

    return program;
}

static float convert_to_screen_x(float x) {
    x /= 384;
    x *= 2;
    x -= 1;
    return x;
}

static float convert_to_screen_y(float y) {
    y /= 224;
    y *= 2;
    y -= 1;
    y *= -1;
    return y;
}

static float convert_color_component(Uint8 component) {
    return (float)component / (float)SDL_MAX_UINT8;
}

static GLColor convert_color(Uint32 color) {
    return (GLColor) {
        .r = convert_color_component((color >> 16) & 0xFF),
        .g = convert_color_component((color >> 8) & 0xFF),
        .b = convert_color_component(color & 0xFF),
        .a = convert_color_component(color >> 24),
    };
}

static void quad_infer_positions(GLQuad* quad) {
    quad->positions[1].x = quad->positions[3].x;
    quad->positions[1].y = quad->positions[0].y;
    quad->positions[2].x = quad->positions[0].x;
    quad->positions[2].y = quad->positions[3].y;
}

static void quad_infer_tex_coords(GLQuad* quad) {
    quad->tex_coords[1].s = quad->tex_coords[3].s;
    quad->tex_coords[1].t = quad->tex_coords[0].t;
    quad->tex_coords[2].s = quad->tex_coords[0].s;
    quad->tex_coords[2].t = quad->tex_coords[3].t;
}

void Moment_CharacterQueued(WORK* wk, int first_chip, int last_chip) {
    // Shadow passes start another native chip list within the same game frame.
    if (first_chip == 0) SDL_zero(character_chips);
    int character = wk == &plw[0].wu ? 1 : wk == &plw[1].wu ? 2 : 0;
    if (!character) {
        character = wk->cg_number >= 14656 && wk->cg_number < 15712 ? 1 :
            wk->cg_number >= 19456 && wk->cg_number < 21120 ? 2 : 0;
    }
    const CharacterFrame* frame = &character_frames[wk->cg_number];
    if (!character || !frame->present || last_chip <= first_chip) return;
    for (int i = first_chip; i < last_chip && i < QUADS_MAX; i++) character_chips[i] = character;
    SDL_assert(arrlen(quads) < QUADS_MAX);
    GLQuad* quad = arraddnptr(quads, 1);
    SDL_zero(*quad);
    const int flip = wk->cg_flip ^ wk->rl_flag;
    const float left = flip & 1 ? -frame->left - frame->world_width : frame->left;
    const float top = flip & 2 ? -frame->top - frame->world_height : frame->top;
    Vec3 points[2] = {{left, -top, 0}, {left + frame->world_width, -top - frame->world_height, 0}};
    njCalcPoints(NULL, points, points, 2);
    quad->positions[0] = (GLVec2){convert_to_screen_x(points[0].x), convert_to_screen_y(points[0].y)};
    quad->positions[3] = (GLVec2){convert_to_screen_x(points[1].x), convert_to_screen_y(points[1].y)};
    quad_infer_positions(quad);
    const float s0 = frame->x / 2048.0f, s1 = (frame->x + frame->width) / 2048.0f;
    const float t0 = frame->y / 2048.0f, t1 = (frame->y + frame->height) / 2048.0f;
    quad->tex_coords[0] = (GLTexCoord){flip & 1 ? s1 : s0, flip & 2 ? t1 : t0};
    quad->tex_coords[3] = (GLTexCoord){flip & 1 ? s0 : s1, flip & 2 ? t0 : t1};
    quad_infer_tex_coords(quad);
    quad->texture_spec = character_pages[frame->page];
    quad->z = seqs_w.chip[first_chip].v[0].z;
    quad->color = convert_color(curr_bright | ((0xFF - wk->my_clear_level) << 24));
    quad->index = arrlen(quads);
    quad->character = character;
    quad->custom = true;
    const Uint16* normal = ColorRAM[(character - 1) * 16];
    const Uint16* current = ColorRAM[wk->current_colcd & 511];
    float difference = 0, r = 0, g = 0, b = 0;
    for (int i = 1; i < 64; i++) {
        const float cr = (current[i] & 31) / 31.0f, cg = ((current[i] >> 5) & 31) / 31.0f,
            cb = ((current[i] >> 10) & 31) / 31.0f;
        r += cr; g += cg; b += cb;
        difference += SDL_fabsf(cr - (normal[i] & 31) / 31.0f) +
            SDL_fabsf(cg - ((normal[i] >> 5) & 31) / 31.0f) +
            SDL_fabsf(cb - ((normal[i] >> 10) & 31) / 31.0f);
    }
    quad->character_tint = (GLColor){r / 63, g / 63, b / 63, SDL_min(.85f, difference / 100)};
}

static void OpenGLRenderer_CreateTexture(unsigned int th) {
    const int texture_index = LO_16_BITS(th) - 1;
    const FLTexture* fl_texture = &flTexture[texture_index];
    const void* pixels = flPS2GetSystemBuffAdrs(fl_texture->mem_handle);

    if (textures[texture_index].handle != 0) {
        glDeleteTextures(1, &textures[texture_index].handle);
        SDL_zero(textures[texture_index]);
    }

    GLint internal_format;
    GLenum format;
    GLenum type;
    GLPaletteType palette_type = PALETTE_NONE;
    GLsizei buffer_width = fl_texture->width;

    switch (fl_texture->format) {
    case SCE_GS_PSMT8:
        internal_format = GL_R8UI;
        format = GL_RED_INTEGER;
        type = GL_UNSIGNED_BYTE;
        palette_type = PALETTE_8;
        break;

    case SCE_GS_PSMT4:
        internal_format = GL_R8UI;
        format = GL_RED_INTEGER;
        type = GL_UNSIGNED_BYTE;
        palette_type = PALETTE_4;
        buffer_width /= 2;
        break;

    case SCE_GS_PSMCT16:
        internal_format = GL_RGB5_A1;
        format = GL_RGBA;
        type = GL_UNSIGNED_SHORT_5_5_5_1;
        palette_type = PALETTE_NONE;
        break;

    case SCE_GS_PSMCT32:
        internal_format = GL_RGBA8;
        format = GL_RGBA;
        type = GL_UNSIGNED_BYTE;
        palette_type = PALETTE_NONE;
        break;

    default:
        fatal_error("Unhandled pixel format: %d", fl_texture->format);
        break;
    }

    Uint16* converted16 = NULL;
    if (fl_texture->format == SCE_GS_PSMCT16) {
        const Uint16* in=pixels;
        int count=buffer_width*fl_texture->height;
        converted16=SDL_malloc(count*2);
        for(int i=0;i<count;i++) converted16[i]=((in[i]&31)<<11)|((in[i]&992)<<1)|((in[i]&31744)>>9)|(in[i]>>15);
        pixels=converted16;
    }
    GLuint texture;
    glGenTextures(1, &texture);
    glBindTexture(GL_TEXTURE_2D, texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, internal_format, buffer_width, fl_texture->height, 0, format, type, pixels);

    SDL_free(converted16);

    textures[texture_index] = (GLTexture) {
        .handle = texture,
        .width = fl_texture->width,
        .height = fl_texture->height,
        .palette_type = palette_type,
    };
}

static void OpenGLRenderer_DestroyTexture(unsigned int texture_handle) {
    // Do nothing
}

static void OpenGLRenderer_UnlockTexture(unsigned int th) {
    OpenGLRenderer_CreateTexture(th);
}

static void OpenGLRenderer_CreatePalette(unsigned int ph) {
    const int palette_index = HI_16_BITS(ph) - 1;
    const FLTexture* fl_palette = &flPalette[palette_index];
    const void* pixels = flPS2GetSystemBuffAdrs(fl_palette->mem_handle);
    const int color_count = fl_palette->width * fl_palette->height;

    if (palettes[palette_index] != 0) {
        glDeleteTextures(1, &palettes[palette_index]);
        palettes[palette_index] = 0;
    }

    GLint internal_format;
    GLenum format;
    GLenum type;

    switch (fl_palette->format) {
    case SCE_GS_PSMCT32:
        internal_format = GL_RGBA8;
        format = GL_RGBA;
        type = GL_UNSIGNED_BYTE;
        break;

    case SCE_GS_PSMCT16:
        internal_format = GL_RGB5_A1;
        format = GL_RGBA;
        type = GL_UNSIGNED_SHORT_5_5_5_1;
        break;

    default:
        fatal_error("Unhandled pixel format: %d", fl_palette->format);
        break;
    }

    Uint8 converted[1024];
    if (fl_palette->format == SCE_GS_PSMCT32) {
        const Uint8* in = pixels;
        for (int i=0;i<color_count;i++) {
            converted[i*4]=in[i*4+2]; converted[i*4+1]=in[i*4+1];
            converted[i*4+2]=in[i*4]; converted[i*4+3]=in[i*4+3];
        }
    } else {
        const Uint16* in=pixels;
        for(int i=0;i<color_count;i++) {
            converted[i*4]=(in[i]&31)*255/31;
            converted[i*4+1]=((in[i]>>5)&31)*255/31;
            converted[i*4+2]=((in[i]>>10)&31)*255/31;
            converted[i*4+3]=(in[i]&32768)?255:0;
        }
    }
    pixels=converted; internal_format=GL_RGBA8; format=GL_RGBA; type=GL_UNSIGNED_BYTE;
    GLuint palette;
    glGenTextures(1, &palette);
    glBindTexture(GL_TEXTURE_2D, palette);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, internal_format, color_count, 1, 0, format, type, pixels);

    palettes[palette_index] = palette;
}

static void OpenGLRenderer_DestroyPalette(unsigned int palette_handle) {
    // Do nothing
}

static void OpenGLRenderer_UnlockPalette(unsigned int ph) {
    OpenGLRenderer_CreatePalette(ph << 16);
}

static void OpenGLRenderer_SetTexture(unsigned int th) {
    const int texture_handle = LO_16_BITS(th);
    const int texture_index = texture_handle - 1;
    latest_texture_spec.texture = textures[texture_index];

    const int palette_handle = HI_16_BITS(th);

    if (palette_handle > 0) {
        const int palette_index = palette_handle - 1;
        latest_texture_spec.palette = palettes[palette_index];
    } else {
        latest_texture_spec.palette = 0;
    }
}

static void OpenGLRenderer_DrawTexturedQuad(const Sprite* sprite, unsigned int color) {
    SDL_assert(arrlen(quads) < QUADS_MAX);

    GLQuad* quad = arraddnptr(quads, 1);
    SDL_zero(*quad);

    for (int i = 0; i < 4; i++) {
        quad->positions[i].x = convert_to_screen_x(sprite->v[i].x);
        quad->positions[i].y = convert_to_screen_y(sprite->v[i].y);
        quad->tex_coords[i].s = sprite->t[i].s;
        quad->tex_coords[i].t = sprite->t[i].t;
    }

    quad->z = sprite->v[0].z;
    quad->index = arrlen(quads);
    quad->color = convert_color(color);
    quad->texture_spec = latest_texture_spec;
}

static void OpenGLRenderer_DrawSprite(const Sprite* sprite, unsigned int color) {
    SDL_assert(arrlen(quads) < QUADS_MAX);

    GLQuad* quad = arraddnptr(quads, 1);
    SDL_zero(*quad);

    quad->positions[0].x = convert_to_screen_x(sprite->v[0].x);
    quad->positions[0].y = convert_to_screen_y(sprite->v[0].y);
    quad->positions[3].x = convert_to_screen_x(sprite->v[3].x);
    quad->positions[3].y = convert_to_screen_y(sprite->v[3].y);
    quad_infer_positions(quad);

    quad->tex_coords[0].s = sprite->t[0].s;
    quad->tex_coords[0].t = sprite->t[0].t;
    quad->tex_coords[3].s = sprite->t[3].s;
    quad->tex_coords[3].t = sprite->t[3].t;
    quad_infer_tex_coords(quad);

    quad->z = sprite->v[0].z;
    quad->index = arrlen(quads);
    quad->color = convert_color(color);
    quad->texture_spec = latest_texture_spec;

    if (hud_part >= 1 && hud_part <= 4) {
        // Both variants share native placement, depth, visibility and brightness.
        // Selection happens at render time, including paused-frame replays.
        quad->character = 3;
        GLQuad custom = *quad;
        const int x = hud_part == 1 ? 0 : hud_part == 2 ? 40 : 80;
        const int y = hud_part == 4 ? 8 : 0;
        const int height = hud_part <= 2 ? 24 : 8;
        custom.custom = true;
        custom.texture_spec = character_hud;
        custom.tex_coords[0] = (GLTexCoord){x / 128.0f, y / 32.0f};
        custom.tex_coords[3] = (GLTexCoord){(x + 40) / 128.0f, (y + height) / 32.0f};
        quad_infer_tex_coords(&custom);
        SDL_assert(arrlen(quads) < QUADS_MAX);
        custom.index = arrlen(quads) + 1;
        arrput(quads, custom);
    }
}

static void OpenGLRenderer_DrawSprite2(const Sprite2* sprite2) {
    SDL_assert(arrlen(quads) < QUADS_MAX);

    GLQuad* quad = arraddnptr(quads, 1);
    SDL_zero(*quad);
    const uintptr_t start = (uintptr_t)seqs_w.chip, at = (uintptr_t)sprite2;
    if (at >= start && at < start + seqs_w.sprTotal * sizeof(Sprite2))
        quad->character = character_chips[(at - start) / sizeof(Sprite2)];

    quad->positions[0].x = convert_to_screen_x(sprite2->v[0].x);
    quad->positions[0].y = convert_to_screen_y(sprite2->v[0].y);
    quad->positions[3].x = convert_to_screen_x(sprite2->v[1].x);
    quad->positions[3].y = convert_to_screen_y(sprite2->v[1].y);
    quad_infer_positions(quad);

    quad->tex_coords[0].s = sprite2->t[0].s;
    quad->tex_coords[0].t = sprite2->t[0].t;
    quad->tex_coords[3].s = sprite2->t[1].s;
    quad->tex_coords[3].t = sprite2->t[1].t;
    quad_infer_tex_coords(quad);

    quad->z = sprite2->v[0].z;
    quad->index = arrlen(quads);
    quad->color = convert_color(sprite2->vertex_color);
    quad->texture_spec = latest_texture_spec;
}

static void OpenGLRenderer_DrawSolidQuad(const Quad* quad, unsigned int color) {
    SDL_assert(arrlen(quads) < QUADS_MAX);

    GLQuad* _quad = arraddnptr(quads, 1);
    SDL_zero(*_quad);

    for (int i = 0; i < 4; i++) {
        _quad->positions[i].x = convert_to_screen_x(quad->v[i].x);
        _quad->positions[i].y = convert_to_screen_y(quad->v[i].y);
    }

    _quad->z = quad->v[0].z;
    _quad->index = arrlen(quads);
    _quad->color = convert_color(color);
    SDL_zero(_quad->texture_spec);
}

static SDL_Window* OpenGLRenderer_Init(const SDLRenderBackendInitInfo* init_info) {
    // Init window

    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);

    window = SDL_CreateWindow(
        init_info->app_name,
        init_info->window_width,
        init_info->window_height,
        init_info->window_flags | SDL_WINDOW_OPENGL
    );

    if (window == NULL) {
        SDL_Log("Failed to create window: %s", SDL_GetError());
        return NULL;
    }

    gl_context = SDL_GL_CreateContext(window);

    if (gl_context == NULL) {
        SDL_Log("Failed to create GL context: %s", SDL_GetError());
        SDL_DestroyWindow(window);
        return NULL;
    }

    SDL_GL_SetSwapInterval(0); // No vsync

    // Init common vars

    arrsetcap(quads, QUADS_MAX);
    vertices = SDL_calloc(QUADS_MAX * 4, sizeof(GLVertex));

    // Configure canvas

    glGenTextures(1, &canvas_color_tex);
    glBindTexture(GL_TEXTURE_2D, canvas_color_tex);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, 384, 224, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);

    glGenTextures(1, &canvas_depth_tex);
    glBindTexture(GL_TEXTURE_2D, canvas_depth_tex);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, 384, 224, 0, GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, NULL);

    glGenFramebuffers(1, &canvas_fbo);
    glBindFramebuffer(GL_FRAMEBUFFER, canvas_fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, canvas_color_tex, 0);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, canvas_depth_tex, 0);

    glBindFramebuffer(GL_FRAMEBUFFER, 0);

    // Configure shaders

    solid_shader = build_shader_program("vert.glsl", "frag_solid.glsl");
    if (solid_shader == 0) {
        SDL_Log("Failed to initialize OpenGL shaders");
        SDL_GL_DestroyContext(gl_context);
        SDL_DestroyWindow(window);
        gl_context = NULL;
        window = NULL;
        return NULL;
    }

    palette_4_shader = build_shader_program("vert.glsl", "frag_palette_4.glsl");

    if (palette_4_shader == 0) {
        SDL_Log("Failed to initialize OpenGL shaders");
        SDL_GL_DestroyContext(gl_context);
        SDL_DestroyWindow(window);
        gl_context = NULL;
        window = NULL;
        return NULL;
    }

    glUseProgram(palette_4_shader);
    glUniform1i(glGetUniformLocation(palette_4_shader, "uPalette"), 0);
    glUniform1i(glGetUniformLocation(palette_4_shader, "uIndexTex"), 1);

    palette_8_shader = build_shader_program("vert.glsl", "frag_palette_8.glsl");

    if (palette_8_shader == 0) {
        SDL_Log("Failed to initialize OpenGL shaders");
        SDL_GL_DestroyContext(gl_context);
        SDL_DestroyWindow(window);
        gl_context = NULL;
        window = NULL;
        return NULL;
    }

    glUseProgram(palette_8_shader);
    glUniform1i(glGetUniformLocation(palette_8_shader, "uPalette"), 0);
    glUniform1i(glGetUniformLocation(palette_8_shader, "uIndexTex"), 1);
    character_tint_location = glGetUniformLocation(palette_8_shader, "uCharacterTint");

    direct_shader = build_shader_program("vert.glsl", "frag_direct.glsl");

    if (direct_shader == 0) {
        SDL_Log("Failed to initialize OpenGL shaders");
        SDL_GL_DestroyContext(gl_context);
        SDL_DestroyWindow(window);
        gl_context = NULL;
        window = NULL;
        return NULL;
    }

    glUseProgram(direct_shader);
    glUniform1i(glGetUniformLocation(direct_shader, "uTexture"), 0);
    direct_tint_location = glGetUniformLocation(direct_shader, "uCharacterTint");

    // Setup vertex data and buffers

    glGenVertexArrays(1, &vertex_array);
    glGenBuffers(1, &vertex_buffer);
    GLuint element_buffer;
    glGenBuffers(1, &element_buffer);

    glBindVertexArray(vertex_array);

    glBindBuffer(GL_ARRAY_BUFFER, vertex_buffer);
    glBufferData(GL_ARRAY_BUFFER, QUADS_MAX * 4 * sizeof(GLVertex), NULL, GL_DYNAMIC_DRAW);

    // Pre-compute indices
    GLuint indices[QUADS_MAX * 6];

    for (int i = 0; i < QUADS_MAX; i++) {
        indices[i * 6 + 0] = i * 4 + 0;
        indices[i * 6 + 1] = i * 4 + 1;
        indices[i * 6 + 2] = i * 4 + 2;
        indices[i * 6 + 3] = i * 4 + 2;
        indices[i * 6 + 4] = i * 4 + 1;
        indices[i * 6 + 5] = i * 4 + 3;
    }

    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, element_buffer);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(indices), indices, GL_STATIC_DRAW);

    // aPos
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(GLVertex), (GLvoid*)offsetof(GLVertex, position));
    glEnableVertexAttribArray(0);
    // aTexCoord
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, sizeof(GLVertex), (GLvoid*)offsetof(GLVertex, tex_coord));
    glEnableVertexAttribArray(1);
    // aColor
    glVertexAttribPointer(2, 4, GL_FLOAT, GL_FALSE, sizeof(GLVertex), (GLvoid*)offsetof(GLVertex, color));
    glEnableVertexAttribArray(2);

    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glBindVertexArray(0);

    if (!load_characters()) {
        SDL_LogError(SDL_LOG_CATEGORY_RENDER, "Custom character artwork could not be initialized");
        return NULL;
    }

    // Misc

    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    // glPolygonMode(GL_FRONT_AND_BACK, GL_LINE);

    return window;
}

static void OpenGLRenderer_Quit() {
    // TODO: Implement
}

static void OpenGLRenderer_RenderFrame(SDL_Rect viewport) {
    extern int web_skip_render;
    if (web_skip_render) { arrsetlen(quads,0); return; }
    if (!replaying) {
        last_quad_count = arrlen(quads);
        SDL_memcpy(last_quads, quads, last_quad_count * sizeof(GLQuad));
    }
    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
    glBindVertexArray(vertex_array);
    glBindBuffer(GL_ARRAY_BUFFER, vertex_buffer);

    // Draw to canvas

    glBindFramebuffer(GL_FRAMEBUFFER, canvas_fbo);
    glViewport(0, 0, 384, 224);
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LEQUAL);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    for (int i = 0; i < arrlen(quads); i++) {
        const int vertex_base = i * 4;
        const GLQuad* quad = &quads[i];

        for (int i = 0; i < 4; i++) {
            vertices[vertex_base + i].position.x = quad->positions[i].x;
            vertices[vertex_base + i].position.y = quad->positions[i].y;
            vertices[vertex_base + i].position.z = quad->z;
            vertices[vertex_base + i].tex_coord = quad->tex_coords[i];
            vertices[vertex_base + i].color = quad->color;
        }
    }

    glBufferSubData(GL_ARRAY_BUFFER, 0, sizeof(GLVertex) * arrlen(quads) * 4, vertices);

    for (int i = 0; i < arrlen(quads); i++) {
        const GLQuad* quad = &quads[i];
        if (quad->character && (original_game ? quad->custom : !quad->custom)) continue;

        if (quad->texture_spec.texture.handle == 0) {
            glUseProgram(solid_shader);
        } else {
            switch (quad->texture_spec.texture.palette_type) {
            case PALETTE_4:
                glUseProgram(palette_4_shader);
                const GLint texture_size_loc = glGetUniformLocation(palette_4_shader, "uTextureSize");
                glUniform2i(texture_size_loc, quad->texture_spec.texture.width, quad->texture_spec.texture.height);
                glActiveTexture(GL_TEXTURE0);
                glBindTexture(GL_TEXTURE_2D, quad->texture_spec.palette);
                glActiveTexture(GL_TEXTURE1);
                glBindTexture(GL_TEXTURE_2D, quad->texture_spec.texture.handle);
                break;

            case PALETTE_8:
                SDL_assert(quad->texture_spec.palette != 0);
                glUseProgram(palette_8_shader);
                glUniform4f(character_tint_location,
                    quad->character_tint.r, quad->character_tint.g, quad->character_tint.b, quad->character_tint.a);
                glActiveTexture(GL_TEXTURE0);
                glBindTexture(GL_TEXTURE_2D, quad->texture_spec.palette);
                glActiveTexture(GL_TEXTURE1);
                glBindTexture(GL_TEXTURE_2D, quad->texture_spec.texture.handle);
                break;

            case PALETTE_NONE:
                glUseProgram(direct_shader);
                glUniform4f(direct_tint_location,
                    quad->character_tint.r, quad->character_tint.g, quad->character_tint.b, quad->character_tint.a);
                glActiveTexture(GL_TEXTURE0);
                glBindTexture(GL_TEXTURE_2D, quad->texture_spec.texture.handle);
                break;
            }
        }

        glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_INT, (GLvoid*)(sizeof(GLuint) * 6 * i));
    }

    // Draw canvas to window

    GLVertex screen_vertices[4] = {
        { .position = { .x = -1, .y = 1 }, .tex_coord = { .s = 0, .t = 1 } },
        { .position = { .x = 1, .y = 1 }, .tex_coord = { .s = 1, .t = 1 } },
        { .position = { .x = -1, .y = -1 }, .tex_coord = { .s = 0, .t = 0 } },
        { .position = { .x = 1, .y = -1 }, .tex_coord = { .s = 1, .t = 0 } },
    };

    for (int i = 0; i < SDL_arraysize(screen_vertices); i++) {
        screen_vertices[i].color = (GLColor) { .r = 1, .g = 1, .b = 1, .a = 1 };
    }

    glBufferSubData(GL_ARRAY_BUFFER, 0, sizeof(screen_vertices), screen_vertices);
    glUseProgram(direct_shader);
    glUniform4f(direct_tint_location, 0, 0, 0, 0);
    glDisable(GL_BLEND);
    glDisable(GL_DEPTH_TEST);

    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(viewport.x, viewport.y, viewport.w, viewport.h);
    glClear(GL_COLOR_BUFFER_BIT);

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, canvas_color_tex);
    glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_INT, (GLvoid*)0);
    glEnable(GL_BLEND);

    // Cleanup

    glBindVertexArray(0);
    SDL_GL_SwapWindow(window);
    arrsetlen(quads, 0);
}

// Internal

const SDLRenderBackend opengl_render_backend = {
    .name = "OpenGL",
    .init = OpenGLRenderer_Init,
    .quit = OpenGLRenderer_Quit,
    .render_frame = OpenGLRenderer_RenderFrame,
    .create_texture = OpenGLRenderer_CreateTexture,
    .destroy_texture = OpenGLRenderer_DestroyTexture,
    .unlock_texture = OpenGLRenderer_UnlockTexture,
    .create_palette = OpenGLRenderer_CreatePalette,
    .destroy_palette = OpenGLRenderer_DestroyPalette,
    .unlock_palette = OpenGLRenderer_UnlockPalette,
    .set_texture = OpenGLRenderer_SetTexture,
    .draw_textured_quad = OpenGLRenderer_DrawTexturedQuad,
    .draw_sprite = OpenGLRenderer_DrawSprite,
    .draw_sprite2 = OpenGLRenderer_DrawSprite2,
    .draw_solid_quad = OpenGLRenderer_DrawSolidQuad,
};

#endif // CRS_VIDEO_DRIVER_OPENGL
