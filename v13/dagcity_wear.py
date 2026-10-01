"""DAG-City clean port + wear wash: a paper-coloured veil over the city whose opacity grows with `wear`
(history). 0% at wear 0, 3% at the first sale, about 19% at 50, 32% at 100, 50% at 255. Drawn before the glow and
frame so the glow stays luminous. The original dagcity.py is untouched."""
import dagcity, rvm

# opacity = 3*(wear>0) + w*(510-w)*47//65025 with w = min(wear,255): concave, never above 50, integer-only
WASH = ('wear jz nowash push -1 stroke push 0xe7dfc8 fill '
        'wear push 255 min dup push 510 swap sub mul push 11 mul push 65025 div '
        'wear push 0 gt push 3 mul add opacity '
        'push 0 push 0 push 1600 push 1600 rect push 100 opacity nowash:')
ANCHOR = 'push 6 push 6 call ix st GX'


def source():
    s = dagcity.source(False)
    assert s.count(ANCHOR) == 1
    return s.replace(ANCHOR, WASH + '\n' + ANCHOR)


def program():
    return rvm.assemble(source())


if __name__ == '__main__':
    p = program()
    print(len(p), 'bytes', rvm.b2(p).hex())
