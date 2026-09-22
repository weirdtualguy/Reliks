// Single source of truth for Studio starter templates.
// Both gen-studio.js and gen-site.js load this file, so an engine exported
// from the local studio and the hosted studio hash identically.
module.exports = {
circles: [
"function reliks(L, serial) {",
"  var n = R.ri(18, 48), out = [];",
"  for (var i = 0; i < n; i++) {",
"    out.push('<circle cx=\"' + R.ri(0,1000) + '\" cy=\"' + R.ri(0,1000) +",
"      '\" r=\"' + R.ri(20,240) + '\" fill=\"' + R.hsl() +",
"      '\" fill-opacity=\"0.' + R.ri(30,85) + '\"/>');",
"  }",
"  return R.svg(out, '#000');",
"}"
].join('\n'),
flow: [
"function reliks(L, serial) {",
"  var out = [], i;",
"  for (i = 0; i < 700; i++) {",
"    var x = R.ri(0, 1000), y = R.ri(0, 1000);",
"    var a = (R.sin(x >> 2) + R.cos(y >> 2)) | 0;",
"    var d = R.dir(a, R.ri(20, 90));",
"    out.push('<line x1=\"' + x + '\" y1=\"' + y + '\" x2=\"' + (x + d[0]) +",
"      '\" y2=\"' + (y + d[1]) + '\" stroke=\"' + R.hsl() +",
"      '\" stroke-width=\"1\" opacity=\"0.5\"/>');",
"  }",
"  return R.svg(out, '#0a0b10');",
"}"
].join('\n'),
blank: [
"function reliks(L, serial) {",
"  return R.svg([], '#000');",
"}"
].join('\n')
};
