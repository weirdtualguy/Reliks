#!/usr/bin/env python3
"""Differential fuzz generator for Reliks-VM: random programs plus the Python reference result. Usage (from v13/vm): fuzz3.py N SEED OUT.json"""
import json, random, sys
from rvm import assemble, render, Fault, b2
N = int(sys.argv[1]); SEED = int(sys.argv[2]); OUT = sys.argv[3]
R = random.Random(SEED)
LANES = [101, -202, 303, -404, 505, -606, 707, -808]; SER = 12345; PAT = 7; WEAR = 99
VALS = [0, 1, -1, 2, 3, 5, 10, 50, 99, 100, 101, 255, 256, 0xFFFFFF, 0x1000000, 0x1000001, 0x1000008, -2, -100, 2147483647, -2147483648, 64, 65, 1023, 1024, 4096, 31, 32]
def val(): return R.choice(VALS) if R.random() < 0.8 else R.randint(-300, 3000)
BIN = 'add sub mul div mod min max and or xor shl shr ushr eq ne lt le gt ge'.split()
UN = 'neg abs not'.split()
COORD = [-20, -1, 0, 1, 2, 5, 10, 30, 64, 100]; SIZE = [0, 1, 2, 3, 5, 10, 40, 64, 100]
COLOR = [0, 0x112233, 0xff0000, 0x00ff00, 0xffffff, 0xabcdef]; OPAC = [0, 1, 5, 10, 50, 75, 99, 100]; SWID = [1, 2, 3, 10, 64]
def P(pool, bad=0.04): return R.choice(VALS) if R.random() < bad else R.choice(pool)
def pu(*vals): return ' '.join('push %d' % v for v in vals)

def gen_sloppy():
    t = ['.canvas %d %d' % (R.choice([1, 16, 64, 100, 4096]), R.choice([1, 16, 64, 100]))]
    st = dict(d=0, path=False, groups=0, grad=False)
    sloppy = R.random() < 0.25
    def need(k):
        while st['d'] < k and (not sloppy or R.random() < 0.7):
            t.append('push %d' % val()); st['d'] += 1
    def use(k, extra=0): st['d'] = max(0, st['d'] - k) + extra
    for _ in range(R.randint(3, 45)):
        r = R.random()
        if st['path'] and r < 0.45:
            c = R.choice(['m', 'l', 'l', 'z', 'lr', 'qr', 'pend', 'pend']); k = {'m': 2, 'l': 2, 'z': 0, 'lr': 2, 'qr': 4, 'pend': 0}[c]
            need(k); t.append(c); use(k)
            if c == 'pend': st['path'] = False
            continue
        if st['grad'] and r < 0.5:
            c = R.choice(['gradstop', 'gradstop', 'gradstop', 'gradend'])
            if c == 'gradstop': need(3); t.append(c); use(3)
            else: t.append(c); st['grad'] = False
            continue
        cls = R.choice(['push', 'push', 'bin', 'un', 'stack', 'rect', 'circle', 'line', 'style', 'pbegin', 'group', 'gradbegin', 'rng', 'mem', 'host'])
        if cls == 'push': t.append('push %d' % val()); use(0, 1)
        elif cls == 'bin': need(2); t.append(R.choice(BIN)); use(2, 1)
        elif cls == 'un': need(1); t.append(R.choice(UN)); use(1, 1)
        elif cls == 'stack':
            c = R.choice(['dup', 'drop', 'swap', 'over', 'rot']); k = {'dup': 1, 'drop': 1, 'swap': 2, 'over': 2, 'rot': 3}[c]
            need(k); t.append(c)
            if c in ('dup', 'over'): st['d'] += 1
            elif c == 'drop': st['d'] = max(0, st['d'] - 1)
        elif cls in ('rect', 'line'): need(4); t.append(cls); use(4)
        elif cls == 'circle': need(3); t.append(cls); use(3)
        elif cls == 'style': need(1); t.append(R.choice(['fill', 'stroke', 'swidth', 'opacity'])); use(1)
        elif cls == 'pbegin': t.append('pbegin'); st['path'] = True
        elif cls == 'group':
            if st['groups'] > 0 and R.random() < 0.5: t.append('gclose'); st['groups'] -= 1
            else: need(1); t.append('gopen'); use(1); st['groups'] += 1
        elif cls == 'gradbegin': t.append('gradbegin'); st['grad'] = True
        elif cls == 'rng':
            c = R.choice(['rnginit', 'rnd', 'rndr'])
            if c == 'rnginit': need(4); t.append(c); use(4)
            elif c == 'rnd': t.append(c); use(0, 1)
            else: need(2); t.append(c); use(2, 1)
        elif cls == 'mem':
            c = R.choice(['load', 'store', 'ldx', 'stx'])
            if c == 'load': t.append('load %d' % R.choice([0, 1, 7, 255])); use(0, 1)
            elif c == 'store': need(1); t.append('store %d' % R.choice([0, 1, 7, 255])); use(1)
            elif c == 'ldx': need(1); t.append('ldx'); use(1, 1)
            else: need(2); t.append('stx'); use(2)
        else: t.append(R.choice(['lane %d' % R.choice([0, 3, 7, 7, 8]), 'serial', 'pat', 'wear'])); use(0, 1)
    if R.random() < 0.7:
        if st['path']: t.append('pend')
        while st['groups']: t.append('gclose'); st['groups'] -= 1
        if st['grad']: t.append('gradend')
    t.append('halt')
    return ' '.join(t)

def gen_valid():
    t = ['.canvas %d %d' % (R.choice([1, 16, 64, 100]), R.choice([1, 16, 64, 100]))]
    S = dict(path=False, groups=0, ngrad=0, rng=False)
    for _ in range(R.randint(4, 40)):
        a = R.choice(['arith', 'arith', 'stack', 'host', 'mem', 'fill', 'stroke', 'swidth', 'opacity', 'rect', 'rect', 'circle', 'line', 'path', 'path', 'group', 'grad', 'rng'])
        if a == 'arith':
            op = R.choice(BIN + UN)
            if op in UN: t.append('%s %s drop' % (pu(R.choice(VALS)), op))
            else:
                b = R.choice([0, 1, 2, 31, 32, -1, 7, 100]) if op in ('div', 'mod', 'shl', 'shr', 'ushr') else R.choice(VALS)
                t.append('%s %s drop' % (pu(R.choice(VALS), b), op))
        elif a == 'stack':
            c = R.choice(['dup', 'swap', 'over', 'rot']); n = {'dup': 1, 'swap': 2, 'over': 2, 'rot': 3}[c]
            t.append('%s %s %s' % (pu(*[R.choice(VALS) for _ in range(n)]), c, ' '.join(['drop'] * (n + (1 if c in ('dup', 'over') else 0)))))
        elif a == 'host': t.append(R.choice(['lane %d' % R.choice([0, 3, 7]), 'serial', 'pat', 'wear']) + ' drop')
        elif a == 'mem':
            addr = R.choice([0, 1, 7, 255, 256, 1023, 1024, -1]); c = R.choice(['store', 'load', 'ldx', 'stx'])
            if c == 'store': t.append('%s store %d' % (pu(R.choice(VALS)), R.choice([0, 1, 7, 255])))
            elif c == 'load': t.append('load %d drop' % R.choice([0, 1, 7, 255]))
            elif c == 'ldx': t.append('%s ldx drop' % pu(addr))
            else: t.append('%s stx' % pu(R.choice(VALS), addr))
        elif a == 'fill': t.append('%s fill' % pu(P(COLOR + [-1] + [0x1000000 + k for k in range(S['ngrad'])])))
        elif a == 'stroke': t.append('%s stroke' % pu(P(COLOR + [-1])))
        elif a == 'swidth': t.append('%s swidth' % pu(P(SWID)))
        elif a == 'opacity': t.append('%s opacity' % pu(P(OPAC)))
        elif a == 'rect': t.append('%s rect' % pu(P(COORD), P(COORD), P(SIZE), P(SIZE)))
        elif a == 'circle': t.append('%s circle' % pu(P(COORD), P(COORD), P(SIZE)))
        elif a == 'line':
            if R.random() < 0.8: t.append('%s stroke' % pu(R.choice(COLOR)))
            t.append('%s line' % pu(P(COORD), P(COORD), P(COORD), P(COORD)))
        elif a == 'path':
            if not S['path']:
                t.append('pbegin'); S['path'] = True; t.append('%s m' % pu(P(COORD), P(COORD)))
            for _ in range(R.randint(0, 5)):
                c = R.choice(['l', 'lr', 'qr', 'z'])
                if c in ('l', 'lr'): t.append('%s %s' % (pu(P(COORD), P(COORD)), c))
                elif c == 'qr': t.append('%s qr' % pu(P(COORD), P(COORD), P(COORD), P(COORD)))
                else: t.append('z')
            if R.random() < 0.8: t.append('pend'); S['path'] = False
        elif a == 'group':
            if S['groups'] > 0 and R.random() < 0.5: t.append('gclose'); S['groups'] -= 1
            else: t.append('%s gopen' % pu(P(OPAC))); S['groups'] += 1
        elif a == 'grad':
            n = R.choice([1, 2, 2, 3, 4]); offs = sorted(R.choice([0, 10, 25, 50, 75, 100]) for _ in range(n))
            if R.random() < 0.05 and n > 1: offs[0], offs[-1] = offs[-1], offs[0]
            t.append('gradbegin')
            for o in offs: t.append('%s gradstop' % pu(R.choice(VALS) if R.random() < 0.03 else o, P(COLOR), P(OPAC)))
            t.append('gradend')
            if n >= 2: S['ngrad'] += 1
        else:
            if not S['rng'] and R.random() < 0.85:
                t.append('%s rnginit' % pu(*[R.choice([0, 1, 7, 123456789, -1, 2147483647]) for _ in range(4)])); S['rng'] = True
            c = R.choice(['rnginit', 'rnd', 'rndr'])
            if c == 'rnginit': t.append('%s rnginit' % pu(*[R.choice([0, 1, 7, 123456789, -1, 2147483647]) for _ in range(4)])); S['rng'] = True
            elif c == 'rnd': t.append('rnd drop')
            else: t.append('%s rndr drop' % pu(R.choice([-5, 0, 3, 10]), R.choice([0, 5, 10, 100, 2147483647])))
    if R.random() < 0.85:
        if S['path']: t.append('pend')
        while S['groups']: t.append('gclose'); S['groups'] -= 1
    t.append('halt')
    return ' '.join(t)

def gen_flow():
    t = R.choice(['loop'] * 20 + ['rec'] * 20 + ['nohalt'] * 6 + ['cond'] * 10 + ['two'] * 6 + ['spin'])
    if t == 'loop':
        k = R.choice([1, 2, 3, 10, 50, 1000, 5001, 10000, 10001])
        body = R.choice(['push 1 push 1 push 2 push 2 rect', 'push 0 push 0 push 5 circle', 'push 7 push 3 add drop', 'push 1 push 2 push 3 push 4 line'])
        return '.canvas 32 32 push 255 stroke push %d store 0 loop: %s load 0 push 1 sub dup store 0 jnz loop halt' % (k, body)
    if t == 'rec':
        return '.canvas 8 8 push %d store 1 call f halt f: load 1 push 1 sub dup store 1 jz done call f done: ret' % R.choice([1, 2, 5, 63, 64, 65, 66])
    if t == 'nohalt': return '.canvas 8 8 ' + R.choice(['push 1 drop', 'push 3 store 0', 'push 1 push 1 add drop'])
    if t == 'cond': return '.canvas 8 8 push %d %s skip push 0 push 0 push 1 push 1 rect skip: halt' % (R.choice([0, 1, -1, 5]), R.choice(['jz', 'jnz']))
    if t == 'spin': return '.canvas 8 8 push 255 stroke lp: push 1 drop jmp lp halt'
    return '.canvas 16 16 call a call b halt a: push 1 push 1 push 3 push 3 rect call b ret b: push 2 push 2 push 1 circle ret'

def mutate(b):
    b = bytearray(b); kind = R.choice(['flip', 'flip', 'set', 'trunc', 'insert', 'delete', 'hdr'])
    lo = 8 if len(b) > 8 and R.random() < 0.7 else 0
    if kind == 'flip' and len(b) > lo: i = R.randrange(lo, len(b)); b[i] ^= 1 << R.randrange(8)
    elif kind == 'set' and len(b) > lo: i = R.randrange(lo, len(b)); b[i] = R.choice([0, 1, 0x7f, 0x80, 0xff, 0x40, 0x43, 0x44, 0x9c, 0x9f, 0x60])
    elif kind == 'trunc' and len(b) > 1: del b[R.randrange(1, len(b)):]
    elif kind == 'insert': b.insert(R.randrange(lo, len(b) + 1), R.randrange(256))
    elif kind == 'delete' and len(b) > lo: del b[R.randrange(lo, len(b))]
    elif kind == 'hdr' and len(b) > 0: b[R.randrange(min(8, len(b)))] = R.choice([0, 1, 0xff, 0x10, 0x52])
    return bytes(b), kind

MODE = sys.argv[4] if len(sys.argv) > 4 else 'plain'
out = []; bad = 0; first = None
for _ in range(N):
    if MODE == 'flow': src = gen_flow()
    elif MODE == 'mut': src = gen_flow() if R.random() < 0.5 else (gen_valid() if R.random() < 0.8 else gen_sloppy())
    else: src = gen_valid() if R.random() < 0.8 else gen_sloppy()
    try: prog = bytes(assemble(src))
    except Exception as e:
        bad += 1; first = first or '%s: %s | %s' % (type(e).__name__, e, src[:90]); continue
    if MODE == 'mut':
        note = []
        for _m in range(R.randint(1, 3)):
            prog, k = mutate(prog); note.append(k)
        src = '[mut ' + ' '.join(note) + '] ' + src
    try:
        svg = render(prog, LANES, SER, PAT, WEAR); res = {'svg_hash': b2(svg.encode('ascii')).hex(), 'svg_len': len(svg)}
    except Fault as f: res = {'fault': f.code}
    except Exception as e: res = {'fault': 'PYEXC:' + type(e).__name__}
    out.append({'src': src, 'hex': prog.hex(), 'py': res})
json.dump({'lanes': LANES, 'serial32': SER, 'pat': PAT, 'wear': WEAR, 'cases': out}, open(OUT, 'w'))
print('generated', len(out), 'programs (' + MODE + '); assemble failures', bad, ('| first: ' + first) if first else '')
