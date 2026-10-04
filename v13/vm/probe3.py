#!/usr/bin/env python3
"""Hand-written probes for rules the spec leaves open. Usage (from v13/vm): probe3.py OUT.json. Results come from the Python reference."""
import json, sys
from rvm import assemble, render, Fault, b2
G4 = 'push 100 gopen push 100 gopen push 100 gopen push 100 gopen'
GR = 'gradbegin push 0 push 0 push 100 gradstop push 100 push 0xffffff push 100 gradstop gradend'
PROBES = [
 ('gopen range', '.canvas 10 10 push 500 gopen halt'),
 ('gopen depth 5, valid opacity', '.canvas 10 10 %s push 50 gopen halt' % G4),
 ('gopen depth 5 + bad opacity', '.canvas 10 10 %s push 500 gopen halt' % G4),
 ('gopen path open + depth 5', '.canvas 10 10 %s pbegin push 50 gopen halt' % G4),
 ('gopen path open + depth 5 + bad opacity', '.canvas 10 10 %s pbegin push 500 gopen halt' % G4),
 ('rect while path open', '.canvas 10 10 pbegin push 0 push 0 m push 1 push 1 push 2 push 2 rect push 3 push 3 l pend halt'),
 ('fill while path open', '.canvas 10 10 pbegin push 0 push 0 m push 255 fill push 3 push 3 l pend halt'),
 ('gclose while path open', '.canvas 10 10 push 100 gopen pbegin push 0 push 0 m gclose pend halt'),
 ('empty path', '.canvas 10 10 pbegin pend halt'),
 ('path with only M', '.canvas 10 10 pbegin push 0 push 0 m pend halt'),
 ('L without M', '.canvas 10 10 pbegin push 1 push 1 l pend halt'),
 ('Z without M', '.canvas 10 10 pbegin z pend halt'),
 ('M twice', '.canvas 10 10 pbegin push 0 push 0 m push 1 push 1 m pend halt'),
 ('PBEGIN twice', '.canvas 10 10 pbegin pbegin halt'),
 ('PEND without PBEGIN', '.canvas 10 10 pend halt'),
 ('first gradient id (fill 0x1000000)', '.canvas 10 10 %s push 16777216 fill push 0 push 0 push 1 push 1 rect halt' % GR),
 ('fill gradient id 1 with one gradient', '.canvas 10 10 %s push 16777217 fill halt' % GR),
 ('fill undefined gradient', '.canvas 10 10 push 16777216 fill halt'),
 ('gradstop outside a gradient', '.canvas 10 10 push 0 push 0 push 100 gradstop halt'),
 ('gradstop outside a gradient + bad offset', '.canvas 10 10 push 200 push 0 push 100 gradstop halt'),
 ('gradstop offsets decrease', '.canvas 10 10 gradbegin push 50 push 0 push 100 gradstop push 10 push 0 push 100 gradstop halt'),
 ('gradend with one stop', '.canvas 10 10 gradbegin push 0 push 0 push 100 gradstop gradend halt'),
 ('draw while gradient open', '.canvas 10 10 gradbegin push 0 push 0 push 1 push 1 rect push 0 push 0 push 100 gradstop push 100 push 0 push 100 gradstop gradend halt'),
 ('rect with zero size', '.canvas 10 10 push 0 push 0 push 0 push 0 rect halt'),
 ('line without stroke', '.canvas 10 10 push 0 push 0 push 1 push 1 line halt'),
 ('gclose, no group, no path', '.canvas 10 10 gclose halt'),
 ('gclose, no group, path open', '.canvas 10 10 pbegin push 0 push 0 m gclose pend halt'),
 ('gradstop 9th stop with bad offset', '.canvas 10 10 gradbegin ' + 'push 0 push 0 push 100 gradstop ' * 8 + 'push 200 push 0 push 100 gradstop halt'),
]
out = []
for name, src in PROBES:
    prog = bytes(assemble(src))
    try:
        svg = render(prog, [0] * 8, 0, 0, 0); res = {'svg_hash': b2(svg.encode('ascii')).hex(), 'svg_len': len(svg)}; shown = 'svg %d' % len(svg)
    except Fault as f: res = {'fault': f.code}; shown = f.code
    print(name.ljust(44), shown)
    out.append({'src': name + ' :: ' + src, 'hex': prog.hex(), 'py': res})
json.dump({'lanes': [0] * 8, 'serial32': 0, 'pat': 0, 'wear': 0, 'cases': out}, open(sys.argv[1], 'w'))
