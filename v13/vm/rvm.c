/* rvm.c: third Reliks-VM implementation (C99), written from v13/RELIKS-VM-SPEC.md sections 2-8.
   Build: cc -O2 -std=c99 -o rvm3 v13/vm/rvm.c
   Run:   rvm3 <lane0,...,lane7> <serial32> <pat> <wear> < program.hex   ->   "FAULT <code>"  or  "OK <len>\n<svg>" */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <setjmp.h>

typedef int32_t i32; typedef uint32_t u32; typedef int64_t i64; typedef uint64_t u64;
enum { E_NONE, E_HEADER, E_DECODE, E_TARGET, E_UNDERFLOW, E_OVERFLOW, E_DIV0, E_RANGE, E_FUEL, E_ELEMS, E_SIZE, E_CALLDEPTH, E_NOHALT, E_PATH, E_RNG, E_STROKE, E_GROUP, E_GRAD };
static const char *FN[] = { "", "E_HEADER", "E_DECODE", "E_TARGET", "E_UNDERFLOW", "E_OVERFLOW", "E_DIV0", "E_RANGE", "E_FUEL", "E_ELEMS", "E_SIZE", "E_CALLDEPTH", "E_NOHALT", "E_PATH", "E_RNG", "E_STROKE", "E_GROUP", "E_GRAD" };
static jmp_buf jb; static int fcode;
static void fault(int c) __attribute__((noreturn));
static void fault(int c) { fcode = c; longjmp(jb, 1); }

static uint8_t prog[65536 + 16]; static int plen;
static const uint8_t *code; static int codelen, W, H;
static unsigned char isstart[65536], opc[65536]; static i32 imm[65536]; static int nxt[65536];

static int kind(int op) {          /* -1 unknown, 0 none, 1 signed LEB, 2 u8, 3 u16 */
  if (op == 0x01) return 1;
  if (op >= 0x00 && op <= 0x06) return 0;
  if (op >= 0x10 && op <= 0x18) return 0;
  if (op >= 0x20 && op <= 0x26) return 0;
  if (op >= 0x30 && op <= 0x35) return 0;
  if (op >= 0x40 && op <= 0x43) return 3;
  if (op == 0x44) return 0;
  if (op == 0x50 || op == 0x51) return 2;
  if (op == 0x52 || op == 0x53) return 0;
  if (op == 0x60) return 2;
  if (op >= 0x61 && op <= 0x63) return 0;
  if (op >= 0x70 && op <= 0x72) return 0;
  if (op >= 0x80 && op <= 0x83) return 0;
  if (op >= 0x90 && op <= 0x92) return 0;
  if (op >= 0x94 && op <= 0x9f) return 0;
  return -1;
}

static int leb(int i, i32 *out) {
  int start = i, n = 0, shift = 0, b; i64 r = 0;
  for (;;) {
    if (i >= codelen) fault(E_DECODE);
    b = code[i++]; n++;
    if (n > 5) fault(E_DECODE);
    r |= (i64)(b & 0x7f) << shift; shift += 7;
    if (!(b & 0x80)) break;
  }
  if (b & 0x40) r -= ((i64)1 << shift);
  if (r < INT32_MIN || r > INT32_MAX) fault(E_DECODE);
  { uint8_t e[8]; int ne = 0; i64 v = r;
    for (;;) {
      int bb = (int)(v & 0x7f); v >>= 7;
      if ((v == 0 && !(bb & 0x40)) || (v == -1 && (bb & 0x40))) { e[ne++] = (uint8_t)bb; break; }
      e[ne++] = (uint8_t)(bb | 0x80);
    }
    if (ne != i - start) fault(E_DECODE);
    for (int k = 0; k < ne; k++) if (e[k] != code[start + k]) fault(E_DECODE); }
  *out = (i32)r; return i;
}

static void parse(void) {
  if (plen < 9) fault(E_HEADER);
  if (prog[0] != 0x52 || prog[1] != 0x56 || prog[2] != 0x4d || prog[3] != 0x01) fault(E_HEADER);
  W = prog[4] | (prog[5] << 8); H = prog[6] | (prog[7] << 8);
  codelen = plen - 8; code = prog + 8;
  if (W < 1 || W > 4096 || H < 1 || H > 4096 || codelen > 65535) fault(E_HEADER);
  int i = 0;
  while (i < codelen) {
    int op = code[i], k = kind(op), s = i; i32 v = 0;
    if (k < 0) fault(E_DECODE);
    i++;
    if (k == 1) i = leb(i, &v);
    else if (k == 2) { if (i >= codelen) fault(E_DECODE); v = code[i++]; if (op == 0x60 && v > 7) fault(E_DECODE); }
    else if (k == 3) { if (i + 2 > codelen) fault(E_DECODE); v = code[i] | (code[i + 1] << 8); i += 2; }
    isstart[s] = 1; opc[s] = (unsigned char)op; imm[s] = v; nxt[s] = i;
  }
  for (int s = 0; s < codelen; s++)
    if (isstart[s] && opc[s] >= 0x40 && opc[s] <= 0x43 && (imm[s] >= codelen || !isstart[imm[s]])) fault(E_TARGET);
}

static i32 st[256]; static int sp; static int cs[64], cp; static i32 mem[1024];
static i32 fillc, strokec, sw, opac;
static u32 rx, ry, rz, rw; static int rinit;
static i32 gfill[4], gstroke[4], gsw[4], gop[4]; static int gd;
static int ngrad, gradopen, nst, sto[8], stc[8], sta[8];
static char *body; static size_t blen, bcap, total; static int elems;
static char pd[140000]; static size_t pdlen; static int nseg, pathopen;
static i32 LANES[8], SER, PAT, WEAR; static char OPEN[96];

static i32 pop(void) { if (!sp) fault(E_UNDERFLOW); return st[--sp]; }
static void push(i32 v) { if (sp >= 256) fault(E_OVERFLOW); st[sp++] = v; }
static void emit(const char *s, size_t n, int count) {
  if (count) elems++;
  if (elems > 10000) fault(E_ELEMS);
  total += n; if (total > 1048576) fault(E_SIZE);
  if (blen + n + 1 > bcap) { while (blen + n + 1 > bcap) bcap *= 2; body = realloc(body, bcap); }
  memcpy(body + blen, s, n); blen += n;
}
static void emits(const char *s, int count) { emit(s, strlen(s), count); }
static void fmtop(char *o, int n) {
  char t[8]; int l;
  if (n == 100) { strcpy(o, "1"); return; }
  if (n == 0) { strcpy(o, "0"); return; }
  sprintf(t, "%02d", n); l = (int)strlen(t); while (l > 0 && t[l - 1] == '0') l--; t[l] = 0;
  strcpy(o, "0."); strcat(o, t);
}
static int colstr(char *b, i32 c) {
  if (c < 0) return sprintf(b, "none");
  if (c > 0xFFFFFF) return sprintf(b, "url(#g%d)", c - 0x1000000);
  return sprintf(b, "#%06x", (unsigned)c);
}
static int tail(char *b, int ws) {
  int n = 0;
  if (ws && strokec >= 0) n += sprintf(b + n, " stroke=\"#%06x\" stroke-width=\"%d\"", (unsigned)strokec, sw);
  if (opac != 100) { char t[8]; fmtop(t, opac); n += sprintf(b + n, " opacity=\"%s\"", t); }
  n += sprintf(b + n, "/>"); return n;
}
static void seg(const char *s) { size_t n = strlen(s); if (++nseg > 2048) fault(E_PATH); memcpy(pd + pdlen, s, n); pdlen += n; }
static u32 rstep(void) { u32 t = rx ^ (rx << 11); rx = ry; ry = rz; rz = rw; rw = (rw ^ (rw >> 19)) ^ (t ^ (t >> 8)); return rw; }

static void run(void) {
  int pc = 0; long fuel = 1000000;
  snprintf(OPEN, sizeof OPEN, "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 %d %d\">", W, H);
  total = strlen(OPEN); fillc = 0; strokec = -1; sw = 1; opac = 100;
  bcap = 1 << 16; body = malloc(bcap);
  for (;;) {
    char buf[1100]; i32 a, b, c, d; int n, op; i32 v;
    if (pc >= codelen || !isstart[pc]) fault(E_NOHALT);
    if (fuel == 0) fault(E_FUEL);
    fuel--;
    op = opc[pc]; v = imm[pc]; pc = nxt[pc];
    switch (op) {
    case 0x00: if (pathopen) fault(E_PATH); if (gd > 0) fault(E_GROUP); if (gradopen) fault(E_GRAD);
               if (total + 6 > 1048576) fault(E_SIZE); return;
    case 0x01: push(v); break;
    case 0x02: if (!sp) fault(E_UNDERFLOW); push(st[sp - 1]); break;
    case 0x03: pop(); break;
    case 0x04: if (sp < 2) fault(E_UNDERFLOW); a = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = a; break;
    case 0x05: if (sp < 2) fault(E_UNDERFLOW); push(st[sp - 2]); break;
    case 0x06: if (sp < 3) fault(E_UNDERFLOW); a = st[sp - 3]; b = st[sp - 2]; c = st[sp - 1]; st[sp - 3] = b; st[sp - 2] = c; st[sp - 1] = a; break;
    case 0x10: b = pop(); a = pop(); push((i32)((u32)a + (u32)b)); break;
    case 0x11: b = pop(); a = pop(); push((i32)((u32)a - (u32)b)); break;
    case 0x12: b = pop(); a = pop(); push((i32)((u32)a * (u32)b)); break;
    case 0x13: b = pop(); a = pop(); if (b == 0) fault(E_DIV0); push((a == INT32_MIN && b == -1) ? a : a / b); break;
    case 0x14: b = pop(); a = pop(); if (b == 0) fault(E_DIV0); push(b == -1 ? 0 : a % b); break;
    case 0x15: a = pop(); push((i32)(0u - (u32)a)); break;
    case 0x16: a = pop(); push(a < 0 ? (i32)(0u - (u32)a) : a); break;
    case 0x17: b = pop(); a = pop(); push(a < b ? a : b); break;
    case 0x18: b = pop(); a = pop(); push(a > b ? a : b); break;
    case 0x20: b = pop(); a = pop(); push(a & b); break;
    case 0x21: b = pop(); a = pop(); push(a | b); break;
    case 0x22: b = pop(); a = pop(); push(a ^ b); break;
    case 0x23: a = pop(); push(~a); break;
    case 0x24: b = pop(); a = pop(); if (b < 0 || b > 31) fault(E_RANGE); push((i32)((u32)a << b)); break;
    case 0x25: b = pop(); a = pop(); if (b < 0 || b > 31) fault(E_RANGE); push(a >> b); break;
    case 0x26: b = pop(); a = pop(); if (b < 0 || b > 31) fault(E_RANGE); push((i32)((u32)a >> b)); break;
    case 0x30: b = pop(); a = pop(); push(a == b); break;
    case 0x31: b = pop(); a = pop(); push(a != b); break;
    case 0x32: b = pop(); a = pop(); push(a < b); break;
    case 0x33: b = pop(); a = pop(); push(a <= b); break;
    case 0x34: b = pop(); a = pop(); push(a > b); break;
    case 0x35: b = pop(); a = pop(); push(a >= b); break;
    case 0x40: pc = v; break;
    case 0x41: a = pop(); if (a == 0) pc = v; break;
    case 0x42: a = pop(); if (a != 0) pc = v; break;
    case 0x43: if (cp >= 64) fault(E_CALLDEPTH); cs[cp++] = pc; pc = v; break;
    case 0x44: if (!cp) fault(E_UNDERFLOW); pc = cs[--cp]; break;
    case 0x50: push(mem[v]); break;
    case 0x51: a = pop(); mem[v] = a; break;
    case 0x52: a = pop(); if (a < 0 || a > 1023) fault(E_RANGE); push(mem[a]); break;
    case 0x53: a = pop(); b = pop(); if (a < 0 || a > 1023) fault(E_RANGE); mem[a] = b; break;
    case 0x60: push(LANES[v]); break;
    case 0x61: push(SER); break;
    case 0x62: push(PAT); break;
    case 0x63: push(WEAR); break;
    case 0x70: { u32 w = (u32)pop(), z = (u32)pop(), y = (u32)pop(), x = (u32)pop();
                 if (!(x | y | z | w)) x = 1;
                 rx = x; ry = y; rz = z; rw = w; rinit = 1; break; }
    case 0x71: if (!rinit) fault(E_RNG); push((i32)(rstep() >> 1)); break;
    case 0x72: { i32 hi = pop(), lo = pop(); u32 w; i64 cnt;
                 if (!rinit) fault(E_RNG);
                 if (hi < lo) fault(E_RANGE);
                 w = rstep(); cnt = (i64)hi - (i64)lo + 1;
                 push((i32)((i64)lo + (i64)((u64)w % (u64)cnt))); break; }
    case 0x80: a = pop();
               if (a == -1 || (a >= 0 && a <= 0xFFFFFF)) fillc = a;
               else if (a >= 0x1000000 && a - 0x1000000 < ngrad) fillc = a;
               else fault(E_RANGE);
               break;
    case 0x81: a = pop(); if (a == -1 || (a >= 0 && a <= 0xFFFFFF)) strokec = a; else fault(E_RANGE); break;
    case 0x82: a = pop(); if (a < 1 || a > 64) fault(E_RANGE); sw = a; break;
    case 0x83: a = pop(); if (a < 0 || a > 100) fault(E_RANGE); opac = a; break;
    case 0x90: d = pop(); c = pop(); b = pop(); a = pop();
               if (c < 0 || d < 0) fault(E_RANGE);
               n = sprintf(buf, "<rect x=\"%d\" y=\"%d\" width=\"%d\" height=\"%d\" fill=\"", a, b, c, d);
               n += colstr(buf + n, fillc); n += sprintf(buf + n, "\""); n += tail(buf + n, 1); emit(buf, n, 1); break;
    case 0x91: c = pop(); b = pop(); a = pop();
               if (c < 0) fault(E_RANGE);
               n = sprintf(buf, "<circle cx=\"%d\" cy=\"%d\" r=\"%d\" fill=\"", a, b, c);
               n += colstr(buf + n, fillc); n += sprintf(buf + n, "\""); n += tail(buf + n, 1); emit(buf, n, 1); break;
    case 0x92: d = pop(); c = pop(); b = pop(); a = pop();
               if (strokec < 0) fault(E_STROKE);
               n = sprintf(buf, "<line x1=\"%d\" y1=\"%d\" x2=\"%d\" y2=\"%d\"", a, b, c, d);
               n += tail(buf + n, 1); emit(buf, n, 1); break;
    case 0x94: if (pathopen) fault(E_PATH); pathopen = 1; pdlen = 0; nseg = 0; break;
    case 0x95: b = pop(); a = pop(); if (!pathopen || nseg > 0) fault(E_PATH); sprintf(buf, "M%d %d", a, b); seg(buf); break;
    case 0x96: b = pop(); a = pop(); if (!pathopen || nseg == 0) fault(E_PATH); sprintf(buf, "L%d %d", a, b); seg(buf); break;
    case 0x97: if (!pathopen || nseg == 0) fault(E_PATH); seg("Z"); break;
    case 0x98: { char *e; size_t m;
                 if (!pathopen || nseg == 0) fault(E_PATH);
                 e = malloc(pdlen + 400); m = (size_t)sprintf(e, "<path d=\"");
                 memcpy(e + m, pd, pdlen); m += pdlen;
                 m += (size_t)sprintf(e + m, "\" fill=\""); m += (size_t)colstr(e + m, fillc);
                 m += (size_t)sprintf(e + m, "\""); m += (size_t)tail(e + m, 1);
                 emit(e, m, 1); free(e); pathopen = 0; break; }
    case 0x99: b = pop(); a = pop(); if (!pathopen || nseg == 0) fault(E_PATH); sprintf(buf, "l%d %d", a, b); seg(buf); break;
    case 0x9a: d = pop(); c = pop(); b = pop(); a = pop(); if (!pathopen || nseg == 0) fault(E_PATH);
               sprintf(buf, "q%d %d %d %d", a, b, c, d); seg(buf); break;
    case 0x9b: a = pop(); if (a < 0 || a > 100) fault(E_RANGE); if (pathopen) fault(E_PATH); if (gd >= 4) fault(E_GROUP);
               if (a == 100) strcpy(buf, "<g>"); else { char t[8]; fmtop(t, a); sprintf(buf, "<g opacity=\"%s\">", t); }
               emits(buf, 1);
               gfill[gd] = fillc; gstroke[gd] = strokec; gsw[gd] = sw; gop[gd] = opac; gd++; opac = 100; break;
    case 0x9c: if (gd == 0) fault(E_GROUP); emits("</g>", 0); gd--; fillc = gfill[gd]; strokec = gstroke[gd]; sw = gsw[gd]; opac = gop[gd]; break;
    case 0x9d: if (gradopen || ngrad >= 8) fault(E_GRAD); gradopen = 1; nst = 0; break;
    case 0x9e: c = pop(); b = pop(); a = pop();        /* opacity, color, offset */
               if (!gradopen || nst >= 8) fault(E_GRAD);
               if (a < 0 || a > 100 || (nst > 0 && a < sto[nst - 1])) fault(E_RANGE);
               if (b < 0 || b > 0xFFFFFF || c < 0 || c > 100) fault(E_RANGE);
               sto[nst] = a; stc[nst] = b; sta[nst] = c; nst++; break;
    case 0x9f: if (!gradopen || nst < 2) fault(E_GRAD);
               n = sprintf(buf, "<defs><radialGradient id=\"g%d\">", ngrad);
               for (int k = 0; k < nst; k++) {
                 n += sprintf(buf + n, "<stop offset=\"%d%%\" stop-color=\"#%06x\"", sto[k], (unsigned)stc[k]);
                 if (sta[k] != 100) { char t[8]; fmtop(t, sta[k]); n += sprintf(buf + n, " stop-opacity=\"%s\"", t); }
                 n += sprintf(buf + n, "/>");
               }
               n += sprintf(buf + n, "</radialGradient></defs>");
               emit(buf, n, 1); gradopen = 0; ngrad++; break;
    default: fault(E_DECODE);
    }
  }
}

int main(int argc, char **argv) {
  int ch, hi = -1;
  if (argc < 5) { fprintf(stderr, "usage: rvm3 lane0,..,lane7 serial32 pat wear < program.hex\n"); return 2; }
  { char *s = argv[1]; for (int k = 0; k < 8; k++) { LANES[k] = (i32)(u32)strtoll(s, &s, 10); if (*s == ',') s++; } }
  SER = (i32)(u32)strtoll(argv[2], NULL, 10); PAT = (i32)strtol(argv[3], NULL, 10); WEAR = (i32)strtol(argv[4], NULL, 10);
  while ((ch = getchar()) != EOF) {
    int h;
    if (ch >= '0' && ch <= '9') h = ch - '0'; else if (ch >= 'a' && ch <= 'f') h = ch - 'a' + 10; else if (ch >= 'A' && ch <= 'F') h = ch - 'A' + 10; else continue;
    if (hi < 0) hi = h; else { if (plen < (int)sizeof prog) prog[plen] = (uint8_t)(hi * 16 + h); plen++; hi = -1; }
  }
  if (setjmp(jb)) { printf("FAULT %s\n", FN[fcode]); return 0; }
  parse(); run();
  printf("OK %zu\n", strlen(OPEN) + blen + 6);
  fwrite(OPEN, 1, strlen(OPEN), stdout); fwrite(body, 1, blen, stdout); fputs("</svg>", stdout);
  return 0;
}
