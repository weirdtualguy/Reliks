"""Compares the VM port against the original JS engine, element by element."""
import json, re, struct, subprocess, sys
import xml.etree.ElementTree as ET
import rvm, dagcity

ROOT = '..'
SERIALS = [1, 2, 3, 7, 42, 99, 12345, 65536, 4294967295, 2884738305227171331]


def original(serial):
    js = "const e=require('./reliks-engine-mainnet.js');process.stdout.write(e.render(%s))" % json.dumps(str(serial))
    return subprocess.run(['node', '-e', js.replace('e.render("%s")' % serial, 'e.render(BigInt("%s"))' % serial)],
                          cwd=ROOT, capture_output=True, text=True, check=True).stdout


def lanes_for(serial):
    s = serial & 0xFFFFFFFF
    lanes = list(struct.unpack('<8i', rvm.b2(b'ReliksSeedV10' + struct.pack('<Q', s))))
    return lanes, rvm.s32(s)


def num(x):
    f = float(x)
    return int(f) if f == int(f) else f


def off(x):
    return num(x[:-1]) / 100 if x.endswith('%') else num(x)


def dtokens(d):
    out = []
    for m in re.finditer(r'([MLlQqVvZz])|(-?\d+(?:\.\d+)?)', d):
        if m.group(1):
            out.append(m.group(1))
        else:
            out.append(num(m.group(2)))
    fixed, i = [], 0
    while i < len(out):
        t = out[i]
        if t == 'v':
            fixed += ['l', 0, out[i + 1]]; i += 2
        elif t == 'z':
            fixed.append('Z'); i += 1
        else:
            fixed.append(t); i += 1
    return fixed


def col(c):
    return '#' + ''.join(ch * 2 for ch in c[1:]) if re.fullmatch(r'#[0-9a-fA-F]{3}', c) else c


def norm(e, inh):
    tag = e.tag.split('}')[1]
    a = e.attrib
    if tag == 'g':
        n2 = dict(inh)
        if 'stroke' in a:
            n2['stroke'] = a['stroke']
        return ('g', num(a.get('opacity', '1')), [norm(c, n2) for c in e])
    if tag == 'defs':
        g = e[0]
        return ('defs', 'g0', [(off(s.attrib['offset']), s.attrib['stop-color'], num(s.attrib.get('stop-opacity', '1'))) for s in g])
    stroke = col(a.get('stroke', inh.get('stroke', 'none')))
    common = (stroke, num(a.get('stroke-width', '1')) if stroke != 'none' else None, num(a.get('opacity', '1')))
    if tag == 'rect':
        return ('rect', num(a.get('x', 0)), num(a.get('y', 0)), num(a['width']), num(a['height']), col(a.get('fill', '#000000')), common)
    if tag == 'circle':
        return ('circle', num(a['cx']), num(a['cy']), num(a['r']), col(a.get('fill', '#000000')), common)
    if tag == 'line':
        return ('line', num(a['x1']), num(a['y1']), num(a['x2']), num(a['y2']), common)
    if tag == 'path':
        return ('path', dtokens(a['d']), col(a.get('fill', '#000000')), common)
    raise ValueError(tag)


def flat(svg):
    root = ET.fromstring(svg.replace('url(#g)', 'url(#g0)'))
    return [norm(c, {}) for c in root]


def main():
    ok = True
    for soft in (True,):
        prog = dagcity.program(soft)
        for s in SERIALS:
            lanes, s32 = lanes_for(s)
            vm_svg = rvm.render(prog, lanes, s32, 0, 0)
            orig = original(s)
            A, B = flat(orig), flat(vm_svg)
            same = A == B
            ok &= same
            print('serial %-20d elems orig=%d vm=%d  orig %6d B  vm %6d B  %s' % (
                s, len(A), len(B), len(orig), len(vm_svg), 'IDENTICAL' if same else 'DIFFERENT'))
            if not same:
                for k, (x, y) in enumerate(zip(A, B)):
                    if x != y:
                        print('  first diff at', k, '\n  orig', x, '\n  vm  ', y); break
    print('ALL IDENTICAL' if ok else 'MISMATCH')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
