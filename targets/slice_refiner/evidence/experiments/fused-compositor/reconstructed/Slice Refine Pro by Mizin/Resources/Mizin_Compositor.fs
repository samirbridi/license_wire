/*{
  "ISFVSN": "2",
  "DESCRIPTION": "Mizin slice compositor. Premultiplied RGBA; one final full-frame pass.",
  "CATEGORIES": ["Mizin"],
  "INPUTS": [
    {"NAME":"videoImage", "TYPE":"image"},
    {"NAME":"softMask", "TYPE":"image"},
    {"NAME":"rawMask", "TYPE":"image"},
    {"NAME":"strokeImage", "TYPE":"image"},
    {"NAME":"outputMode", "TYPE":"long", "DEFAULT":0, "MIN":0, "MAX":2},
    {"NAME":"blackBackground", "TYPE":"bool", "DEFAULT":false}
  ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    vec4 base = vec4(0.0);
    if (outputMode < 2) {
        float soft = IMG_NORM_PIXEL(softMask, uv).a;
        float mask = outputMode == 0
            ? 1.0 - clamp(IMG_NORM_PIXEL(rawMask, uv).a - soft, 0.0, 1.0)
            : soft;
        base = IMG_NORM_PIXEL(videoImage, uv) * mask;
    }
    vec4 stroke = IMG_NORM_PIXEL(strokeImage, uv);
    vec4 result = stroke + base * (1.0 - stroke.a);
    if (blackBackground) result.a = 1.0;
    gl_FragColor = result;
}
