#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

in vec4 vColor;
in vec2 vTexCoord;
out vec4 FragColor;

uniform sampler2D uPalette;
uniform usampler2D uIndexTex;
uniform vec4 uCharacterTint;

void main() {
    uint index = texture(uIndexTex, vTexCoord).r;
    vec4 color = texelFetch(uPalette, ivec2(int(index),0), 0);
    color.rgb = mix(color.rgb, uCharacterTint.rgb, uCharacterTint.a);
    FragColor = color * vColor;

	if (FragColor.a == 0.0) {
		discard;
	}
}
