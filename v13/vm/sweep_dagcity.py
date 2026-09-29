"""Wider sweep: 300 random serials, faithful port vs original; records worst-case resource use."""
import random, sys, io, contextlib
import verify_dagcity as v
import rvm, dagcity

random.seed(20260929)
prog = dagcity.program(True)
worst = {}
bad = 0
serials = [random.randrange(1, 1 << 63) for _ in range(300)]
for s in serials:
    lanes, s32 = v.lanes_for(s)
    st = {}
    svg = rvm.render(prog, lanes, s32, 0, 0, st)
    for k, val in st.items():
        worst[k] = max(worst.get(k, 0), val)
    if v.flat(svg) != v.flat(v.original(s)):
        bad += 1
        print('MISMATCH', s)
print('serials', len(serials), 'mismatches', bad, 'worst', worst)
