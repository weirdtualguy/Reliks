"""Builds vectors.json for Reliks-VM v1 and cross-checks hand-written expectations."""
import json, re, struct, hashlib
import rvm
from rvm import assemble, render, Fault, b2, host_inputs, s32

ZERO_IN = dict(lanes=[0] * 8, serial32=0, pat=0, wear=0)
cases = []


def run(prog, inp):
    try:
        return dict(svg=render(prog, inp['lanes'], inp['serial32'], inp['pat'], inp['wear']))
    except Fault as f:
        return dict(fault=f.code)


def add(name, prog, inp=ZERO_IN, expect_fault=None, values=None, note=''):
    r = run(prog, inp)
    if expect_fault is not None:
        assert r.get('fault') == expect_fault, (name, r.get('fault'), expect_fault)
        exp = dict(fault=expect_fault)
    else:
        assert 'svg' in r, (name, r)
        svg = r['svg']
        if values is not None:
            got = [int(v) for v in re.findall(r'<rect x="(-?\d+)"', svg)]
            assert got == values, (name, got, values)
        exp = dict(svg_hash=b2(svg.encode('ascii')).hex(), svg_len=len(svg))
        if len(svg) <= 700:
            exp['svg'] = svg
    c = dict(name=name, program_hex=bytes(prog).hex(), inputs=inp, expect=exp)
    if values is not None:
        c['values'] = values
    if note:
        c['note'] = note
    cases.append(c)
    return c


# ---- 1. minimal -----------------------------------------------------------
add('minimal_rect', assemble('.canvas 64 64 push 0xff0000 fill push 8 push 8 push 48 push 48 rect halt'))

# ---- 2. arithmetic, hand-written expectations (independent of both interpreters) ----
arith_src = """.canvas 64 64
push 2147483647 push 1 add show
push -2147483648 push 1 sub show
push 65536 push 65536 mul show
push 123456789 push 987654321 mul show
push 7 push 2 div show
push -7 push 2 div show
push 7 push -2 div show
push -2147483648 push -1 div show
push 7 push 3 mod show
push -7 push 3 mod show
push 7 push -3 mod show
push -2147483648 push -1 mod show
push -2147483648 neg show
push -2147483648 abs show
push -5 abs show
push 3 push -4 min show
push 3 push -4 max show
push 0xf0f0 push 0x0ff0 and show
push 0xf0f0 push 0x0ff0 or show
push 0xf0f0 push 0x0ff0 xor show
push 0 not show
push 1 push 31 shl show
push -8 push 1 shr show
push -8 push 1 ushr show
push -1 push 31 ushr show
push -1 push 0 ushr show
push 5 push 5 eq show
push 5 push 6 eq show
push -1 push 1 lt show
push 3 push 3 ge show
push 1 push 2 push 3 rot show show show
push 1 push 2 swap show show
push 1 push 2 over show show show
halt"""
imul = s32(123456789 * 987654321)
arith_expect = [-2147483648, 2147483647, 0, imul, 3, -3, -3, -2147483648, 1, -1, 1, 0,
                -2147483648, -2147483648, 5, -4, 3, 0x00f0, 0xfff0, 0xff00, -1,
                -2147483648, -4, 2147483644, 1, -1, 1, 0, 1, 1, 1, 3, 2, 1, 2, 1, 2, 1]
add('arithmetic_edges', assemble(arith_src), values=arith_expect)

# ---- 3. PRNG (independent xorshift written separately) --------------------------
def xs(seed, n):
    x, y, z, w = seed
    out = []
    for _ in range(n):
        t = x ^ ((x << 11) & 0xFFFFFFFF)
        x, y, z = y, z, w
        w = (w ^ (w >> 19)) ^ (t ^ (t >> 8))
        w &= 0xFFFFFFFF
        out.append(w)  # full uint32; RND pushes w>>1, RNDR uses w mod span
    return out

rng_src = '.canvas 64 64 push 1 push 2 push 3 push 4 rnginit ' + 'rnd show ' * 8 + \
          'push 10 push 20 rndr show ' * 4 + 'halt'
seq = xs((1, 2, 3, 4), 12)
rng_expect = [w >> 1 for w in seq[:8]] + [10 + (w % 11) for w in seq[8:12]]
add('prng_seq_and_range', assemble(rng_src), values=rng_expect)
add('prng_zero_seed_is_1000', assemble('.canvas 64 64 push 0 push 0 push 0 push 0 rnginit ' + 'rnd show ' * 4 + 'halt'),
    values=[w >> 1 for w in xs((1, 0, 0, 0), 4)])
add('prng_negative_seed_words', assemble('.canvas 64 64 push -1 push -2 push -3 push -4 rnginit ' + 'rnd show ' * 3 + 'halt'),
    values=[w >> 1 for w in xs((0xFFFFFFFF, 0xFFFFFFFE, 0xFFFFFFFD, 0xFFFFFFFC), 3)])

# ---- 4. inputs -------------------------------------------------------------
in_src = '.canvas 64 64 ' + ' '.join('lane %d show' % k for k in range(8)) + ' serial show pat show wear show halt'
for label, serial, lin, sales in [('a', 1, bytes(32), 0), ('b', (1 << 62) + 12345, bytes(range(32)), 7),
                                  ('c', 4294967295, b'\xff' * 32, 100000)]:
    lanes, s32v, pat, wear = host_inputs(serial, lin, sales)
    inp = dict(lanes=lanes, serial32=s32v, pat=pat, wear=wear)
    add('inputs_readback_' + label, assemble(in_src), inp, values=lanes + [s32v, pat, wear])

# ---- 5. style / shapes / canonical formatting ------------------------------
shapes = """.canvas 200 120
push 0xf4efe0 fill push 0 push 0 push 200 push 120 rect
push 0x1a1a1a stroke push 3 swidth
push 0x49c5b1 fill push 20 push 20 push 40 push 30 rect
push -1 fill push 100 push 40 push 25 circle
push 0xe8923a fill push -1 stroke
push 50 opacity push 150 push 60 push 20 circle
push 5 opacity push 10 push 90 push 30 push 20 rect
push 10 opacity push 50 push 90 push 30 push 20 rect
push 25 opacity push 90 push 90 push 30 push 20 rect
push 0 opacity push 130 push 90 push 30 push 20 rect
push 100 opacity push 0x000000 stroke push 2 swidth push 10 push 110 push 190 push 110 line
pbegin push 100 push 70 m push 130 push 100 l push 70 push 100 l z pend
push -5 push -7 push 3 push 2 rect
halt"""
add('shapes_and_formatting', assemble(shapes))

# ---- 6. control flow ---------------------------------------------------------
flow = """.canvas 100 20
push 0 store 0
loop:
  load 0 call sq
  load 0 push 1 add dup store 0 push 5 lt jnz loop
halt
sq: push 20 mul push 0 push 10 push 10 rect ret"""
add('loop_and_call', assemble(flow), values=[0, 20, 40, 60, 80])

# ---- 7. demo engine ---------------------------------------------------------
demo = """.canvas 256 256
push 0xf4efe0 fill push 0 push 0 push 256 push 256 rect
lane 0 lane 1 lane 2 lane 3 rnginit
loop:
  rnd push 0xffffff and pat push 0x040404 mul xor fill
  push 100 wear push 40 min sub opacity
  push 0 push 15 rndr push 16 mul
  push 0 push 15 rndr push 16 mul
  push 4 push 16 rndr dup rect
  load 0 push 1 add dup store 0 push 64 lt jnz loop
halt"""
demo_prog = assemble(demo)
for label, serial, lin, sales in [('s1_fresh', 1, bytes(32), 0), ('s1_worn', 1, bytes(32), 40),
                                  ('s1_patina', 1, b2(b'x'), 0), ('s99', 99, b2(b'y'), 12)]:
    lanes, s32v, pat, wear = host_inputs(serial, lin, sales)
    add('demo_engine_' + label, demo_prog, dict(lanes=lanes, serial32=s32v, pat=pat, wear=wear),
        note='demo engine, %d bytes' % len(demo_prog))

# ---- 8. limits (pass) ---------------------------------------------------------
many = """.canvas 64 64
loop: push 0 push 0 push 1 push 1 rect load 0 push 1 add dup store 0 push %d lt jnz loop halt"""
add('elems_exactly_10000', assemble(many % 10000))
add('elems_10001_fault', assemble(many % 10001), expect_fault='E_ELEMS')
segs = """.canvas 64 64
pbegin push 0 push 0 m
loop: push 1 push 1 l load 0 push 1 add dup store 0 push %d lt jnz loop
pend halt"""
add('path_segments_exactly_2048', assemble(segs % 2047))
add('path_segments_2049_fault', assemble(segs % 2048), expect_fault='E_PATH')
size = """.canvas 64 64
push 0 store 1
outer:
  pbegin push -2000000000 push -2000000000 m
  push 0 store 0
  inner:
    push -2000000000 push -2000000000 l
    load 0 push 1 add dup store 0 push 1500 lt jnz inner
  pend
  load 1 push 1 add dup store 1 push 40 lt jnz outer
halt"""
add('svg_size_limit_fault', assemble(size), expect_fault='E_SIZE')
# RND/RNDR fault order: operands are popped first (E_UNDERFLOW), then E_RNG if RNGINIT has not run, then the range check.
add('rndr_underflow_before_rng', assemble('.canvas 64 64 rndr halt'), expect_fault='E_UNDERFLOW')
add('rndr_rng_before_range', assemble('.canvas 64 64 push 5 push 3 rndr halt'), expect_fault='E_RNG')

# ---- SVG size boundary. Measured: opening tag 60 bytes, '</svg>' 6, a path element is 51 + 24 per L segment with 11-char coordinates.
# 21 full paths (M + 2047 L) = 1,032,759 bytes, plus a path of 654 full L's and a last short L = 15,751 bytes: 66 + 1,032,759 + 15,751 = 1,048,576.
def size_prog(last_x, last_y, tail=''):
    return """.canvas 64 64
push 0 store 1
outer:
  pbegin push -2000000000 push -2000000000 m
  push 0 store 0
  inner:
    push -2000000000 push -2000000000 l
    load 0 push 1 add dup store 0 push 2047 lt jnz inner
  pend
  load 1 push 1 add dup store 1 push 21 lt jnz outer
pbegin push -2000000000 push -2000000000 m
push 0 store 0
inner2:
  push -2000000000 push -2000000000 l
  load 0 push 1 add dup store 0 push 654 lt jnz inner2
push %d push %d l
pend
%shalt""" % (last_x, last_y, tail)
c = add('svg_size_exactly_limit_passes', assemble(size_prog(0, 0)), note='1,048,576-byte SVG: running total and final length both at the limit')
assert c['expect']['svg_len'] == 1048576, c['expect']['svg_len']
add('svg_size_one_over_only_via_closing_tag', assemble(size_prog(0, 10)), expect_fault='E_SIZE', note='body is 1,048,571 bytes; only </svg> pushes the SVG over the limit')
add('svg_size_closing_tag_window_then_div0', assemble(size_prog(0, 10, 'push 0 push 0 div ')), expect_fault='E_DIV0', note='a fault raised during execution wins over the final size check')
add('svg_size_running_total_over_before_div0', assemble(size_prog(12345678, 1, 'push 0 push 0 div ')), expect_fault='E_SIZE', note='emission pushes the running total over the limit before the later division by zero runs')
# ---- rules pinned 2026-10-03: the JavaScript, Python and C implementations agree on all of these (vectors rule_*)
_G4 = 'push 100 gopen push 100 gopen push 100 gopen push 100 gopen'
_GR = 'gradbegin push 0 push 0 push 100 gradstop push 100 push 0xffffff push 100 gradstop gradend'
for _n, _src, _f in [
  ('rule_gopen_bad_opacity', '.canvas 10 10 push 500 gopen halt', 'E_RANGE'),
  ('rule_gopen_depth5_valid_opacity', '.canvas 10 10 ' + _G4 + ' push 50 gopen halt', 'E_GROUP'),
  ('rule_gopen_depth5_bad_opacity_range_first', '.canvas 10 10 ' + _G4 + ' push 500 gopen halt', 'E_RANGE'),
  ('rule_gopen_path_open_depth5', '.canvas 10 10 ' + _G4 + ' pbegin push 50 gopen halt', 'E_PATH'),
  ('rule_gopen_path_open_bad_opacity', '.canvas 10 10 ' + _G4 + ' pbegin push 500 gopen halt', 'E_PATH'),
  ('rule_rect_while_path_open', '.canvas 10 10 pbegin push 0 push 0 m push 1 push 1 push 2 push 2 rect push 3 push 3 l pend halt', None),
  ('rule_fill_while_path_open', '.canvas 10 10 pbegin push 0 push 0 m push 255 fill push 3 push 3 l pend halt', None),
  ('rule_gclose_path_open', '.canvas 10 10 push 100 gopen pbegin push 0 push 0 m gclose pend halt', 'E_PATH'),
  ('rule_empty_path_pend', '.canvas 10 10 pbegin pend halt', 'E_PATH'),
  ('rule_path_only_m_valid', '.canvas 10 10 pbegin push 0 push 0 m pend halt', None),
  ('rule_l_without_m', '.canvas 10 10 pbegin push 1 push 1 l pend halt', 'E_PATH'),
  ('rule_z_without_m', '.canvas 10 10 pbegin z pend halt', 'E_PATH'),
  ('rule_m_twice', '.canvas 10 10 pbegin push 0 push 0 m push 1 push 1 m pend halt', 'E_PATH'),
  ('rule_pbegin_twice', '.canvas 10 10 pbegin pbegin halt', 'E_PATH'),
  ('rule_pend_without_pbegin', '.canvas 10 10 pend halt', 'E_PATH'),
  ('rule_first_gradient_id_0', '.canvas 10 10 ' + _GR + ' push 16777216 fill push 0 push 0 push 1 push 1 rect halt', None),
  ('rule_fill_gradient_id_1_undefined', '.canvas 10 10 ' + _GR + ' push 16777217 fill halt', 'E_RANGE'),
  ('rule_fill_gradient_never_defined', '.canvas 10 10 push 16777216 fill halt', 'E_RANGE'),
  ('rule_gradstop_outside_gradient', '.canvas 10 10 push 0 push 0 push 100 gradstop halt', 'E_GRAD'),
  ('rule_gradstop_outside_gradient_bad_offset', '.canvas 10 10 push 200 push 0 push 100 gradstop halt', 'E_GRAD'),
  ('rule_gradstop_offsets_decrease', '.canvas 10 10 gradbegin push 50 push 0 push 100 gradstop push 10 push 0 push 100 gradstop halt', 'E_RANGE'),
  ('rule_gradend_one_stop', '.canvas 10 10 gradbegin push 0 push 0 push 100 gradstop gradend halt', 'E_GRAD'),
  ('rule_draw_while_gradient_open', '.canvas 10 10 gradbegin push 0 push 0 push 1 push 1 rect push 0 push 0 push 100 gradstop push 100 push 0 push 100 gradstop gradend halt', None),
  ('rule_rect_zero_size_valid', '.canvas 10 10 push 0 push 0 push 0 push 0 rect halt', None),
  ('rule_line_without_stroke', '.canvas 10 10 push 0 push 0 push 1 push 1 line halt', 'E_STROKE'),
]:
    add(_n, assemble(_src), expect_fault=_f)


# ---- 8b. rev-2 ops: uint32 RNDR, indirect memory, relative path, groups, gradients ----
seed = (0xdeadbeef, 0x12345678, 0x9abcdef0, 0xfeedface)
w0 = xs(seed, 2)
add('rndr_full_uint32_span', assemble('.canvas 64 64 ' + ' '.join('push %d' % s32(v) for v in seed) + ' rnginit '
    'push -2147483648 push 2147483647 rndr show push 5 push 5 rndr show halt'),
    values=[-2147483648 + w0[0], 5])
add('memory_indirect', assemble('.canvas 64 64 push 111 push 300 stx push 222 push 1023 stx '
    'push 300 ldx show push 1023 ldx show push 5 ldx show halt'), values=[111, 222, 0])

def add_svg(name, src, expect_svg):
    c = add(name, assemble(src))
    assert c['expect']['svg'] == expect_svg, (name, c['expect']['svg'])

add_svg('relative_path_and_curve',
    '.canvas 100 100 push 0xff8800 fill pbegin push 10 push 20 m push 30 push 0 lr push 0 push 15 lr '
    'push 5 push -10 push 10 push 0 qr z pend halt',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 20l30 0l0 15q5 -10 10 0Z" fill="#ff8800"/></svg>')
add_svg('group_restores_style',
    '.canvas 10 10 push 0xaa0000 fill push 100 gopen push 0x00bb00 fill push 0 push 0 push 1 push 1 rect gclose '
    'push 2 push 0 push 1 push 1 rect halt',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g><rect x="0" y="0" width="1" height="1" fill="#00bb00"/></g>'
    '<rect x="2" y="0" width="1" height="1" fill="#aa0000"/></svg>')
add_svg('group_opacity_is_consumed',
    '.canvas 10 10 push 40 opacity push 50 gopen push 0 push 0 push 1 push 1 rect gclose push 2 push 0 push 1 push 1 rect halt',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g opacity="0.5"><rect x="0" y="0" width="1" height="1" fill="#000000"/></g>'
    '<rect x="2" y="0" width="1" height="1" fill="#000000" opacity="0.4"/></svg>')
add('group_depth_4_ok', assemble('.canvas 10 10 ' + 'push 100 gopen ' * 4 + 'gclose ' * 4 + 'halt'))
add('fault_group_depth_5', assemble('.canvas 10 10 ' + 'push 100 gopen ' * 5 + 'halt'), expect_fault='E_GROUP')
add('fault_gclose_without_open', assemble('gclose halt'), expect_fault='E_GROUP')
add('fault_halt_with_open_group', assemble('push 100 gopen halt'), expect_fault='E_GROUP')
add('fault_gopen_with_open_path', assemble('pbegin push 100 gopen halt'), expect_fault='E_PATH')
add('fault_gopen_opacity_101', assemble('push 101 gopen halt'), expect_fault='E_RANGE')
GR = 'gradbegin push 0 push 0xffd9a0 push 100 gradstop push 30 push 0xe8923a push 80 gradstop push 100 push 0xe8923a push 0 gradstop gradend '
add_svg('gradient_define_and_use',
    '.canvas 10 10 ' + GR + 'push 0x1000000 fill push 5 push 5 push 4 circle halt',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><radialGradient id="g0">'
    '<stop offset="0%" stop-color="#ffd9a0"/><stop offset="30%" stop-color="#e8923a" stop-opacity="0.8"/>'
    '<stop offset="100%" stop-color="#e8923a" stop-opacity="0"/></radialGradient></defs>'
    '<circle cx="5" cy="5" r="4" fill="url(#g0)"/></svg>')
add('gradient_second_id_valid', assemble('.canvas 10 10 ' + GR + GR + 'push 0x1000001 fill halt'))
add('fault_gradient_id_undefined', assemble('.canvas 10 10 ' + GR + 'push 0x1000001 fill halt'), expect_fault='E_RANGE')
add('fault_gradient_as_stroke', assemble('.canvas 10 10 ' + GR + 'push 0x1000000 stroke halt'), expect_fault='E_RANGE')
add('fault_gradend_one_stop', assemble('gradbegin push 0 push 0 push 100 gradstop gradend halt'), expect_fault='E_GRAD')
add('fault_gradstop_outside', assemble('push 0 push 0 push 100 gradstop halt'), expect_fault='E_GRAD')
add('fault_gradbegin_nested', assemble('gradbegin gradbegin halt'), expect_fault='E_GRAD')
add('fault_halt_with_open_gradient', assemble('gradbegin halt'), expect_fault='E_GRAD')
add('fault_gradstop_offsets_decrease', assemble('gradbegin push 50 push 0 push 100 gradstop push 40 push 0 push 100 gradstop halt'), expect_fault='E_RANGE')
add('fault_gradstop_color_range', assemble('gradbegin push 0 push 16777216 push 100 gradstop halt'), expect_fault='E_RANGE')
add('fault_gradient_ninth', assemble('.canvas 10 10 ' + GR * 9 + 'halt'), expect_fault='E_GRAD')
add('gradient_eight_ok', assemble('.canvas 10 10 ' + GR * 8 + 'halt'))
add('fault_gradient_ninth_stop', assemble('gradbegin ' + 'push 0 push 0 push 100 gradstop ' * 9 + 'halt'), expect_fault='E_GRAD')
add('fault_stx_out_of_range', assemble('push 1 push 1024 stx halt'), expect_fault='E_RANGE')
add('fault_ldx_negative', assemble('push -1 ldx halt'), expect_fault='E_RANGE')
add('fault_stx_underflow', assemble('push 1 stx halt'), expect_fault='E_UNDERFLOW')
add('fault_lr_without_path', assemble('push 1 push 1 lr halt'), expect_fault='E_PATH')
add('fault_lr_before_m', assemble('pbegin push 1 push 1 lr halt'), expect_fault='E_PATH')


# ---- 8c. DAG-City ports (faithful = matches original JS engine; clean = builtin RNG + wear/patina) ----
import dagcity, struct as _st
def v10_inputs(serial):
    sm = serial & 0xFFFFFFFF
    lanes = list(_st.unpack('<8i', b2(b'ReliksSeedV10' + _st.pack('<Q', sm))))
    return dict(lanes=lanes, serial32=s32(sm), pat=0, wear=0)
soft_prog, clean_prog = dagcity.program(True), dagcity.program(False)
for sv in (1, 2, 7, 12345):
    add('dagcity_faithful_serial_%d' % sv, soft_prog, v10_inputs(sv), note='element-identical to reliks-engine-mainnet.js')
for sv, pat, wear in ((1, 0, 0), (1, 0, 40), (1, 37, 0), (99, 63, 255)):
    lanes, s32v, p, w = host_inputs(sv, bytes(32), 0)
    add('dagcity_clean_s%d_pat%d_wear%d' % (sv, pat, wear), clean_prog,
        dict(lanes=lanes, serial32=s32v, pat=pat, wear=wear))

# ---- 9. faults ---------------------------------------------------------------
def hdr(w=64, h=64, magic=rvm.MAGIC):
    return magic + struct.pack('<HH', w, h)

F = [
    ('bad_magic', hdr(magic=b'RVX\x01') + b'\x00', 'E_HEADER'),
    ('header_too_short', rvm.MAGIC + b'\x40\x00', 'E_HEADER'),
    ('canvas_zero_width', hdr(0, 64) + b'\x00', 'E_HEADER'),
    ('canvas_too_large', hdr(4097, 64) + b'\x00', 'E_HEADER'),
    ('empty_code', hdr(), 'E_HEADER'),
    ('unknown_opcode', hdr() + b'\xff', 'E_DECODE'),
    ('truncated_push', hdr() + b'\x01', 'E_DECODE'),
    ('nonminimal_sleb', hdr() + b'\x01\x80\x00\x00', 'E_DECODE'),
    ('sleb_six_bytes', hdr() + b'\x01\x80\x80\x80\x80\x80\x00\x00', 'E_DECODE'),
    ('sleb_out_of_int32', hdr() + b'\x01\x80\x80\x80\x80\x08\x00', 'E_DECODE'),
    ('lane_index_8', assemble('lane 8 halt'), 'E_DECODE'),
    ('truncated_jump', hdr() + b'\x40\x00', 'E_DECODE'),
    ('jump_out_of_range', assemble('jmp 5000 halt'), 'E_TARGET'),
    ('jump_into_immediate', assemble('push 300 jmp 1 halt'), 'E_TARGET'),
    ('jump_to_end', assemble('jmp 3'), 'E_TARGET'),
    ('underflow_add', assemble('add halt'), 'E_UNDERFLOW'),
    ('underflow_ret', assemble('ret'), 'E_UNDERFLOW'),
    ('underflow_rot', assemble('push 1 push 2 rot halt'), 'E_UNDERFLOW'),
    ('div_zero', assemble('push 1 push 0 div halt'), 'E_DIV0'),
    ('mod_zero', assemble('push 1 push 0 mod halt'), 'E_DIV0'),
    ('shl_32', assemble('push 1 push 32 shl halt'), 'E_RANGE'),
    ('shr_negative', assemble('push 1 push -1 shr halt'), 'E_RANGE'),
    ('fuel_exhausted', assemble('l: jmp l'), 'E_FUEL'),
    ('no_halt', assemble('push 1'), 'E_NOHALT'),
    ('stack_overflow', assemble('l: push 1 jmp l'), 'E_OVERFLOW'),
    ('call_depth', assemble('f: call f'), 'E_CALLDEPTH'),
    ('rnd_uninitialised', assemble('rnd halt'), 'E_RNG'),
    ('rndr_uninitialised', assemble('push 0 push 1 rndr halt'), 'E_RNG'),
    ('rndr_hi_below_lo', assemble('push 1 push 2 push 3 push 4 rnginit push 5 push 4 rndr halt'), 'E_RANGE'),
    ('line_without_stroke', assemble('push 0 push 0 push 1 push 1 line halt'), 'E_STROKE'),
    ('path_l_before_m', assemble('pbegin push 1 push 1 l halt'), 'E_PATH'),
    ('path_open_at_halt', assemble('pbegin push 1 push 1 m halt'), 'E_PATH'),
    ('path_second_m', assemble('pbegin push 1 push 1 m push 2 push 2 m halt'), 'E_PATH'),
    ('pend_empty', assemble('pbegin pend halt'), 'E_PATH'),
    ('pbegin_nested', assemble('pbegin pbegin halt'), 'E_PATH'),
    ('z_without_path', assemble('z halt'), 'E_PATH'),
    ('fill_above_range', assemble('push 16777216 fill halt'), 'E_RANGE'),
    ('fill_below_minus_one', assemble('push -2 fill halt'), 'E_RANGE'),
    ('swidth_zero', assemble('push 0 swidth halt'), 'E_RANGE'),
    ('opacity_101', assemble('push 101 opacity halt'), 'E_RANGE'),
    ('rect_negative_width', assemble('push 0 push 0 push -1 push 1 rect halt'), 'E_RANGE'),
    ('circle_negative_radius', assemble('push 0 push 0 push -1 circle halt'), 'E_RANGE'),
]
for name, prog, code in F:
    add('fault_' + name, prog, expect_fault=code)

vectors = dict(
    spec='Reliks-VM v1',
    limits=dict(FUEL_MAX=rvm.FUEL_MAX, STACK_MAX=rvm.STACK_MAX, CALL_MAX=rvm.CALL_MAX, MAX_ELEMS=rvm.MAX_ELEMS,
                MAX_SEGS=rvm.MAX_SEGS, MAX_SVG=rvm.MAX_SVG, WEAR_CAP=rvm.WEAR_CAP),
    host=[], cases=cases)
for serial, lin, sales in [(1, bytes(32), 0), ((1 << 62) + 12345, bytes(range(32)), 7), (4294967295, b'\xff' * 32, 100000),
                           (0, bytes(32), 255), (2884738305227171331, b2(b'reliks'), 256)]:
    lanes, s32v, pat, wear = host_inputs(serial, lin, sales)
    vectors['host'].append(dict(serial=str(serial), lineage=lin.hex(), sales=sales, lanes=lanes, serial32=s32v, pat=pat, wear=wear))
vectors['anchors'] = dict(
    dagcity_faithful_bytes=len(soft_prog), dagcity_faithful_program_hash=rvm.program_hash(soft_prog).hex(),
    dagcity_clean_bytes=len(clean_prog), dagcity_clean_program_hash=rvm.program_hash(clean_prog).hex(),
    demo_engine_bytes=len(demo_prog), demo_program_hash=rvm.program_hash(demo_prog).hex(),
    demo_render_hash=rvm.render_hash(demo_prog).hex())
json.dump(vectors, open('vectors.json', 'w'), indent=1)
print('cases', len(cases), 'demo engine bytes', len(demo_prog))
print(json.dumps(vectors['anchors'], indent=1))
