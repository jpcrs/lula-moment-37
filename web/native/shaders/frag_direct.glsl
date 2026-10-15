#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

in vec4 vColor;
in vec2 vTexCoord;
out vec4 FragColor;

uniform sampler2D uTexture;
uniform vec4 uCharacterTint;

void main() {
    vec4 color = texture(uTexture, vTexCoord);
    color.rgb = mix(color.rgb, uCharacterTint.rgb, uCharacterTint.a);
    FragColor = color * vColor;

	if (FragColor.a == 0.0) {
		discard;
	}
}
