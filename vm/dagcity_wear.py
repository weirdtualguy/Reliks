"""DAG-City clean port + wear wash: a paper-coloured veil over the city whose opacity grows with `wear`
(history). Opacity % = 3*(wear>0) + 27 - floor(27*(255-w)^3 / 255^3), w = min(wear,255): 0 at wear 0, 4 at the first
sale, about 16 at 50, 24 at 100, 30 at 255. Integer-only, concave, never above 30. Drawn before the glow and frame
so the glow stays luminous. The original dagcity.py is untouched."""
import dagcity, rvm

WASH = ('wear jz nowash push -1 stroke push 0xe7dfc8 fill '
        'wear push 255 min push 255 swap sub dup dup mul mul push 27 mul push 16581375 div push 27 swap sub '
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
