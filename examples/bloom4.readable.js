// bloom4 — "orbital garden" (Series v4 showcase)
// layered gradient sky
for (let i = 0; i < 12; i++) {
  cv.color(cv.hsl(620 + i * 24, 460, 52 + i * 10));
  cv.rect(0, i * 86, 1024, 86);
}
// twinkling star field (frame-gated scatter)
cv.mirror(() => {
  for (let i = 0; i < 26; i++) {
    if (rng.f() > 0.25 + ((frame * 137) % 97) / 400) {
      cv.color(rng.pick([0xf5f5f5, 0xffd166, 0x9ad1ff]));
      cv.dot(rng.int(40, 480), rng.int(30, 990), rng.int(2, 7));
    }
  }
});
// orbital ring system
for (let k = 0; k < 4; k++) {
  cv.color(cv.hsl(120 + k * 220, 700, 300 + k * 60));
  cv.ring(512, 512, 150 + k * 86 + ((frame * 13) % 23));
}
// six-fold mandala, noise-gated petal style
cv.sym(6, () => {
  for (let j = 0; j < 3; j++) {
    const x = rng.int(90, 330), y = rng.int(170, 470), n = rng.f();
    cv.color(rng.pick([0xdc2828, 0xff8fa3, 0x7bd05f, 0x3aa0ff, 0xffd166]));
    if (n > 0.66) cv.line(512, 512, 512 + x, 512 - y, rng.int(5, 20));
    else if (n > 0.33) cv.tri(512, 512, 512 + x, 512 - y, 512 + (x >> 1) + 40, 512 - (y >> 1) - 40);
    else cv.circle(512 + x, 512 - y, rng.int(9, 38));
    if (rng.f() > 0.5) cv.ring(512 + (x >> 1), 512 - (y >> 1), rng.int(18, 64));
  }
});
// frame-driven satellites on the outer orbit
for (let s = 0; s < 8; s++) {
  const a = (s * 128 + frame * 71) & 1023;
  cv.color(rng.pick([0xf5f5f5, 0xffd166]));
  cv.dot(512 + ((a & 511) - 256), 512 - (((a >> 2) & 511) - 256), rng.int(6, 16));
}
// breathing core
cv.color(0xf5f5f5);
cv.ring(512, 512, 58 + frame * 44);
cv.circle(512, 512, 18);
