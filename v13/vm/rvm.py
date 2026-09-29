"""Reliks-VM v1: reference interpreter and assembler (Python 3, stdlib only)."""
import hashlib
import struct

MAGIC = b'RVM\x01'
FUEL_MAX = 1_000_000
STACK_MAX = 256
CALL_MAX = 64
MAX_ELEMS = 10_000
MAX_SEGS = 2048
MEM_SIZE = 1024
GROUP_MAX = 4
GRAD_MAX = 8
STOP_MAX = 8
MAX_SVG = 1 << 20
WEAR_CAP = 255
M32 = 0xFFFFFFFF
INT_MIN = -(1 << 31)
INT_MAX = (1 << 31) - 1

# name: (opcode, immediate kind)  kinds: s = signed LEB128, u8, u16
OPS = {
    'halt': (0x00, None), 'push': (0x01, 's'), 'dup': (0x02, None), 'drop': (0x03, None),
    'swap': (0x04, None), 'over': (0x05, None), 'rot': (0x06, None),
    'add': (0x10, None), 'sub': (0x11, None), 'mul': (0x12, None), 'div': (0x13, None),
    'mod': (0x14, None), 'neg': (0x15, None), 'abs': (0x16, None), 'min': (0x17, None), 'max': (0x18, None),
    'and': (0x20, None), 'or': (0x21, None), 'xor': (0x22, None), 'not': (0x23, None),
    'shl': (0x24, None), 'shr': (0x25, None), 'ushr': (0x26, None),
    'eq': (0x30, None), 'ne': (0x31, None), 'lt': (0x32, None), 'le': (0x33, None),
    'gt': (0x34, None), 'ge': (0x35, None),
    'jmp': (0x40, 'u16'), 'jz': (0x41, 'u16'), 'jnz': (0x42, 'u16'), 'call': (0x43, 'u16'), 'ret': (0x44, None),
    'load': (0x50, 'u8'), 'store': (0x51, 'u8'), 'ldx': (0x52, None), 'stx': (0x53, None),
    'lane': (0x60, 'u8'), 'serial': (0x61, None), 'pat': (0x62, None), 'wear': (0x63, None),
    'rnginit': (0x70, None), 'rnd': (0x71, None), 'rndr': (0x72, None),
    'fill': (0x80, None), 'stroke': (0x81, None), 'swidth': (0x82, None), 'opacity': (0x83, None),
    'rect': (0x90, None), 'circle': (0x91, None), 'line': (0x92, None),
    'pbegin': (0x94, None), 'm': (0x95, None), 'l': (0x96, None), 'z': (0x97, None), 'pend': (0x98, None),
    'lr': (0x99, None), 'qr': (0x9A, None), 'gopen': (0x9B, None), 'gclose': (0x9C, None),
    'gradbegin': (0x9D, None), 'gradstop': (0x9E, None), 'gradend': (0x9F, None),
}
BYCODE = {v[0]: (k, v[1]) for k, v in OPS.items()}
JUMPS = ('jmp', 'jz', 'jnz', 'call')


class Fault(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def s32(x):
    x &= M32
    return x - (1 << 32) if x & 0x80000000 else x


def sleb_enc(v):
    out = bytearray()
    while True:
        b = v & 0x7F
        v >>= 7
        if (v == 0 and not (b & 0x40)) or (v == -1 and (b & 0x40)):
            out.append(b)
            return bytes(out)
        out.append(b | 0x80)


def sleb_dec(code, i):
    start, result, shift, n = i, 0, 0, 0
    while True:
        if i >= len(code):
            raise Fault('E_DECODE')
        b = code[i]
        i += 1
        n += 1
        if n > 5:
            raise Fault('E_DECODE')
        result |= (b & 0x7F) << shift
        shift += 7
        if not (b & 0x80):
            break
    if b & 0x40:
        result -= 1 << shift
    if not (INT_MIN <= result <= INT_MAX):
        raise Fault('E_DECODE')
    if sleb_enc(result) != bytes(code[start:i]):  # minimal encoding only
        raise Fault('E_DECODE')
    return result, i


def parse(prog):
    prog = bytes(prog)
    if len(prog) < 9 or prog[:4] != MAGIC:
        raise Fault('E_HEADER')
    W, H = struct.unpack('<HH', prog[4:8])
    code = prog[8:]
    if not (1 <= W <= 4096 and 1 <= H <= 4096) or len(code) > 65535:
        raise Fault('E_HEADER')
    insns, i = {}, 0
    while i < len(code):
        op = code[i]
        if op not in BYCODE:
            raise Fault('E_DECODE')
        name, kind = BYCODE[op]
        start = i
        i += 1
        imm = None
        if kind == 's':
            imm, i = sleb_dec(code, i)
        elif kind == 'u8':
            if i >= len(code):
                raise Fault('E_DECODE')
            imm = code[i]
            i += 1
        elif kind == 'u16':
            if i + 2 > len(code):
                raise Fault('E_DECODE')
            imm = code[i] | (code[i + 1] << 8)
            i += 2
        if name == 'lane' and imm > 7:
            raise Fault('E_DECODE')
        insns[start] = (name, imm, i)
    for off, (name, imm, _) in insns.items():
        if name in JUMPS and imm not in insns:
            raise Fault('E_TARGET')
    return W, H, code, insns


def tdiv(a, b):
    q = abs(a) // abs(b)
    return q if (a < 0) == (b < 0) else -q


def fmt_op(n):
    if n == 100:
        return '1'
    if n == 0:
        return '0'
    return '0.' + ('%02d' % n).rstrip('0')


def render(prog, lanes, serial32, pat, wear, stats=None):
    """Returns the canonical SVG string or raises Fault(code)."""
    W, H, code, insns = parse(prog)
    OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d">' % (W, H)
    stack, calls, mem = [], [], [0] * MEM_SIZE
    fuel, pc = FUEL_MAX, 0
    fill, stroke, sw, opac = 0, -1, 1, 100
    rng = None
    body, total, elems, path = [], len(OPEN), 0, None
    groups, grad, ngrad = [], None, 0

    def pop():
        if not stack:
            raise Fault('E_UNDERFLOW')
        return stack.pop()

    def need(n):
        if len(stack) < n:
            raise Fault('E_UNDERFLOW')

    def push(v):
        if len(stack) >= STACK_MAX:
            raise Fault('E_OVERFLOW')
        stack.append(v)
        if stats is not None and len(stack) > stats.get('max_stack', 0):
            stats['max_stack'] = len(stack)

    def emit(s, count=True):
        nonlocal elems, total
        if count:
            elems += 1
        if elems > MAX_ELEMS:
            raise Fault('E_ELEMS')
        total += len(s)
        if total > MAX_SVG:
            raise Fault('E_SIZE')
        body.append(s)

    def fcol(c):
        if c < 0:
            return 'none'
        if c > 0xFFFFFF:
            return 'url(#g%d)' % (c - 0x1000000)
        return '#%06x' % c

    def tail(with_stroke=True):
        s = ''
        if with_stroke and stroke >= 0:
            s += ' stroke="#%06x" stroke-width="%d"' % (stroke, sw)
        if opac != 100:
            s += ' opacity="%s"' % fmt_op(opac)
        return s + '/>'

    while True:
        if pc not in insns:
            raise Fault('E_NOHALT')
        if fuel == 0:
            raise Fault('E_FUEL')
        fuel -= 1
        name, imm, nxt = insns[pc]
        pc = nxt
        if name == 'halt':
            if path is not None:
                raise Fault('E_PATH')
            if groups:
                raise Fault('E_GROUP')
            if grad is not None:
                raise Fault('E_GRAD')
            break
        elif name == 'push':
            push(imm)
        elif name == 'dup':
            need(1); push(stack[-1])
        elif name == 'drop':
            pop()
        elif name == 'swap':
            need(2); stack[-1], stack[-2] = stack[-2], stack[-1]
        elif name == 'over':
            need(2); push(stack[-2])
        elif name == 'rot':
            need(3); a = stack.pop(-3); stack.append(a)
        elif name in ('add', 'sub', 'mul', 'div', 'mod', 'min', 'max', 'and', 'or', 'xor',
                      'shl', 'shr', 'ushr', 'eq', 'ne', 'lt', 'le', 'gt', 'ge'):
            b = pop(); a = pop()
            if name == 'add': r = s32(a + b)
            elif name == 'sub': r = s32(a - b)
            elif name == 'mul': r = s32(a * b)
            elif name in ('div', 'mod'):
                if b == 0:
                    raise Fault('E_DIV0')
                q = tdiv(a, b)
                r = s32(q) if name == 'div' else s32(a - b * q)
            elif name == 'min': r = min(a, b)
            elif name == 'max': r = max(a, b)
            elif name == 'and': r = s32(a & b)
            elif name == 'or': r = s32(a | b)
            elif name == 'xor': r = s32(a ^ b)
            elif name in ('shl', 'shr', 'ushr'):
                if not (0 <= b <= 31):
                    raise Fault('E_RANGE')
                if name == 'shl': r = s32(a << b)
                elif name == 'shr': r = a >> b
                else: r = s32((a & M32) >> b)
            else:
                r = int({'eq': a == b, 'ne': a != b, 'lt': a < b, 'le': a <= b, 'gt': a > b, 'ge': a >= b}[name])
            push(r)
        elif name == 'neg':
            push(s32(-pop()))
        elif name == 'abs':
            a = pop(); push(s32(-a) if a < 0 else a)
        elif name == 'not':
            push(s32(~pop()))
        elif name == 'jmp':
            pc = imm
        elif name == 'jz':
            if pop() == 0: pc = imm
        elif name == 'jnz':
            if pop() != 0: pc = imm
        elif name == 'call':
            if len(calls) >= CALL_MAX:
                raise Fault('E_CALLDEPTH')
            calls.append(nxt); pc = imm
        elif name == 'ret':
            if not calls:
                raise Fault('E_UNDERFLOW')
            pc = calls.pop()
        elif name == 'load':
            push(mem[imm])
        elif name == 'store':
            mem[imm] = pop()
        elif name == 'ldx':
            a = pop()
            if not (0 <= a < MEM_SIZE):
                raise Fault('E_RANGE')
            push(mem[a])
        elif name == 'stx':
            a = pop(); v = pop()
            if not (0 <= a < MEM_SIZE):
                raise Fault('E_RANGE')
            mem[a] = v
        elif name == 'lane':
            push(lanes[imm])
        elif name == 'serial':
            push(serial32)
        elif name == 'pat':
            push(pat)
        elif name == 'wear':
            push(wear)
        elif name == 'rnginit':
            w = pop() & M32; z = pop() & M32; y = pop() & M32; x = pop() & M32
            if x == 0 and y == 0 and z == 0 and w == 0:
                x = 1
            rng = [x, y, z, w]
        elif name == 'rnd' or name == 'rndr':
            if name == 'rndr':
                hi = pop(); lo = pop()
            if rng is None:
                raise Fault('E_RNG')
            x, y, z, w = rng
            t = (x ^ (x << 11)) & M32
            x, y, z = y, z, w
            w = ((w ^ (w >> 19)) ^ (t ^ (t >> 8))) & M32
            rng = [x, y, z, w]
            r = w >> 1
            if name == 'rnd':
                push(r)
            else:
                if hi < lo:
                    raise Fault('E_RANGE')
                push(lo + (w % (hi - lo + 1)))
        elif name in ('fill', 'stroke'):
            c = pop()
            if name == 'fill' and 0x1000000 <= c < 0x1000000 + ngrad:
                pass
            elif not (c == -1 or 0 <= c <= 0xFFFFFF):
                raise Fault('E_RANGE')
            if name == 'fill': fill = c
            else: stroke = c
        elif name == 'swidth':
            v = pop()
            if not (1 <= v <= 64):
                raise Fault('E_RANGE')
            sw = v
        elif name == 'opacity':
            v = pop()
            if not (0 <= v <= 100):
                raise Fault('E_RANGE')
            opac = v
        elif name == 'rect':
            need(4); h = pop(); w = pop(); y = pop(); x = pop()
            if w < 0 or h < 0:
                raise Fault('E_RANGE')
            emit('<rect x="%d" y="%d" width="%d" height="%d" fill="%s"%s' % (x, y, w, h, fcol(fill), tail()))
        elif name == 'circle':
            need(3); r = pop(); cy = pop(); cx = pop()
            if r < 0:
                raise Fault('E_RANGE')
            emit('<circle cx="%d" cy="%d" r="%d" fill="%s"%s' % (cx, cy, r, fcol(fill), tail()))
        elif name == 'line':
            need(4); y2 = pop(); x2 = pop(); y1 = pop(); x1 = pop()
            if stroke < 0:
                raise Fault('E_STROKE')
            emit('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#%06x" stroke-width="%d"%s' %
                 (x1, y1, x2, y2, stroke, sw, tail(False)))
        elif name == 'pbegin':
            if path is not None:
                raise Fault('E_PATH')
            path = []
        elif name in ('m', 'l'):
            need(2); y = pop(); x = pop()
            if path is None or (name == 'l' and not path) or len(path) >= MAX_SEGS:
                raise Fault('E_PATH')
            if name == 'm' and path:
                raise Fault('E_PATH')
            path.append('%s%d %d' % (name.upper(), x, y))
        elif name in ('lr', 'qr'):
            if name == 'qr':
                need(4); dy = pop(); dx = pop(); cy = pop(); cx = pop()
            else:
                need(2); dy = pop(); dx = pop()
            if path is None or not path or len(path) >= MAX_SEGS:
                raise Fault('E_PATH')
            path.append('l%d %d' % (dx, dy) if name == 'lr' else 'q%d %d %d %d' % (cx, cy, dx, dy))
        elif name == 'gopen':
            v = pop()
            if path is not None:
                raise Fault('E_PATH')
            if not (0 <= v <= 100):
                raise Fault('E_RANGE')
            if len(groups) >= GROUP_MAX:
                raise Fault('E_GROUP')
            emit('<g>' if v == 100 else '<g opacity="%s">' % fmt_op(v))
            groups.append((fill, stroke, sw, opac))
            opac = 100
        elif name == 'gclose':
            if path is not None:
                raise Fault('E_PATH')
            if not groups:
                raise Fault('E_GROUP')
            emit('</g>', count=False)
            fill, stroke, sw, opac = groups.pop()
        elif name == 'gradbegin':
            if grad is not None or ngrad >= GRAD_MAX:
                raise Fault('E_GRAD')
            grad = []
        elif name == 'gradstop':
            need(3); o = pop(); c = pop(); off = pop()
            if grad is None or len(grad) >= STOP_MAX:
                raise Fault('E_GRAD')
            if not (0 <= off <= 100 and 0 <= c <= 0xFFFFFF and 0 <= o <= 100):
                raise Fault('E_RANGE')
            if grad and off < grad[-1][0]:
                raise Fault('E_RANGE')
            grad.append((off, c, o))
        elif name == 'gradend':
            if grad is None or len(grad) < 2:
                raise Fault('E_GRAD')
            stops = ''.join('<stop offset="%d%%" stop-color="#%06x"%s/>' %
                            (off, c, '' if o == 100 else ' stop-opacity="%s"' % fmt_op(o)) for off, c, o in grad)
            emit('<defs><radialGradient id="g%d">%s</radialGradient></defs>' % (ngrad, stops))
            ngrad += 1
            grad = None
        elif name == 'z':
            if path is None or not path or len(path) >= MAX_SEGS:
                raise Fault('E_PATH')
            path.append('Z')
        elif name == 'pend':
            if path is None or not path:
                raise Fault('E_PATH')
            emit('<path d="%s" fill="%s"%s' % (''.join(path), fcol(fill), tail()))
            path = None
    svg = OPEN + ''.join(body) + '</svg>'
    if len(svg) > MAX_SVG:
        raise Fault('E_SIZE')
    if stats is not None:
        stats.update(fuel=FUEL_MAX - fuel, elems=elems, svg_len=len(svg))
    return svg


def b2(data):
    return hashlib.blake2b(data, digest_size=32).digest()


def host_inputs(serial, lineage, sales):
    """serial: int in [0, 2^63); lineage: 32 bytes; sales: int >= 0."""
    assert 0 <= serial < (1 << 63) and len(lineage) == 32 and sales >= 0
    lanes = list(struct.unpack('<8i', b2(b'ReliksSeedV2' + struct.pack('<Q', serial))))
    pat = b2(b'ReliksPatinaV2' + bytes(lineage))[0] & 63
    return lanes, s32(serial & M32), pat, min(sales, WEAR_CAP)


def render_edition(prog, serial, lineage, sales):
    return render(prog, *host_inputs(serial, lineage, sales))


def program_hash(prog):
    return b2(bytes(prog))


def render_hash(prog):
    """Anchor: serial 1, zero lineage, zero sales."""
    return b2(render_edition(prog, 1, bytes(32), 0).encode('ascii'))


# ---------------- assembler ----------------
def assemble(src):
    """Token stream. `.canvas W H`, `.byte N` (raw), `label:`, mnemonics, immediates
    (decimal or 0x hex), jump operands are labels. Macro `show` = store 255 load 255 push 0 push 1 push 1 rect."""
    toks = []
    for line in src.split('\n'):
        toks += line.split(';')[0].split()
    exp, i, names = [], 0, {}
    while i < len(toks):
        t = toks[i]
        tl = t.lower()
        if tl == '.var':          # .var NAME CELL   (named memory cell)
            names[toks[i + 1]] = int(toks[i + 2], 0); i += 3; continue
        if tl == 'show':
            exp += ['store', '255', 'load', '255', 'push', '0', 'push', '1', 'push', '1', 'rect']
        elif tl in ('next', 'nextle'):   # next VAR LIMIT LABEL : ++VAR; loop while VAR < (<=) LIMIT
            var, lim, lab = toks[i + 1], toks[i + 2], toks[i + 3]
            exp += ['load', var, 'push', '1', 'add', 'dup', 'store', var]
            exp += ['load', lim] if lim in names else ['push', lim]
            exp += ['lt' if tl == 'next' else 'le', 'jnz', lab]
            i += 3
        elif tl in ('ld', 'st'):
            exp += ['load' if tl == 'ld' else 'store', toks[i + 1]]; i += 1
        else:
            exp.append(t)
        i += 1
    W = H = 64
    items, i = [], 0
    while i < len(exp):
        t = exp[i]
        if t == '.canvas':
            W, H = int(exp[i + 1], 0), int(exp[i + 2], 0); i += 3
        elif t == '.byte':
            items.append(('raw', bytes([int(exp[i + 1], 0)]))); i += 2
        elif t.endswith(':'):
            items.append(('label', t[:-1])); i += 1
        else:
            name = t.lower()
            op, kind = OPS[name]
            if kind is None:
                items.append(('op', op, None, None)); i += 1
            else:
                items.append(('op', op, kind, exp[i + 1])); i += 2
    labels, off = {}, 0
    for it in items:
        if it[0] == 'label': labels[it[1]] = off
        elif it[0] == 'raw': off += 1
        else:
            _, op, kind, arg = it
            off += 1
            if kind == 's': off += len(sleb_enc(int(arg, 0)))
            elif kind == 'u8': off += 1
            elif kind == 'u16': off += 2
    code = bytearray()
    for it in items:
        if it[0] == 'label': continue
        if it[0] == 'raw': code += it[1]; continue
        _, op, kind, arg = it
        code.append(op)
        if kind == 's': code += sleb_enc(int(arg, 0))
        elif kind == 'u8': code.append(int(names[arg]) if arg in names else int(arg, 0))
        elif kind == 'u16':
            tgt = labels[arg] if arg in labels else int(arg, 0)
            code += struct.pack('<H', tgt)
    return MAGIC + struct.pack('<HH', W, H) + bytes(code)
