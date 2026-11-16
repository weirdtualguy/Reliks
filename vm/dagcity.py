"""DAG-City ("Reliks Genesis City v3") ported to Reliks-VM.
soft=True : faithful port. RNG is bytecode (state in memory cells) and the drawing variables x,y alias
            the RNG state exactly like the original JS engine, so output is element-for-element identical.
soft=False: clean port. Uses the built-in RNG, separate variables, and lets wear/patina drive the art."""
import rvm


def source(soft=True):
    L = []
    a = L.append
    a('.canvas 1600 1600')
    a('.var RX 0 .var RY 1 .var RZ 2 .var RW 3')
    a('.var X 0 .var Y 1' if soft else '.var X 17 .var Y 18')
    a('.var I 4 .var J 5 .var K 6 .var S 7 .var H 8 .var D 9 .var T 10 .var DK 11 .var C 12')
    a('.var WI 13 .var WJ 14 .var N 15 .var P0 16 .var TM 20 .var TOP 21 .var LF 22 .var RF 23')
    a('.var WN 24 .var AH 25 .var DI 26 .var DJ 27 .var NN 28 .var E2 29 .var QX 30 .var QY 31')
    a('.var BX 32 .var BY 33 .var GX 34 .var GY 35')
    # prologue: glow gradient and background
    a('gradbegin push 0 push 0xffd9a0 push 100 gradstop push 30 push 0xe8923a push 80 gradstop '
      'push 100 push 0xe8923a push 0 gradstop gradend')
    a('push 0xe7dfc8 fill push 0 push 0 push 1600 push 1600 rect')
    if soft:
        a('lane 0 serial xor st RX lane 1 st RY lane 2 st RZ lane 3 st RW')
    else:
        a('lane 0 serial xor lane 1 lane 2 lane 3 rnginit')
    # scatter lines
    a('push 0xd3c9ab stroke push 50 gopen push 0 st I')
    a('scatter: push 60 push 1540 call ri st X push 60 push 1540 call ri st Y push 30 push 130 call ri st K')
    a('ld X ld Y ld X ld K add ld Y ld K push 2 div add line next I 150 scatter gclose')
    # iso grid
    a('push 0xcfc5a8 stroke push 55 gopen push 0 st I')
    a('grid: ld I push 0 call ix ld I push 0 call iy ld I push 13 call ix ld I push 13 call iy line')
    a('push 0 ld I call ix push 0 ld I call iy push 13 ld I call ix push 13 ld I call iy line nextle I 13 grid gclose')
    # canals
    a('push 0 st N push 0 st C')
    a('canal: ld C push 2 mod jz even push 2 push 11 call ri st WI push 0 st WJ jmp start')
    a('even: push 0 st WI push 2 push 11 call ri st WJ')
    a('start: ld N st P0 call addpt')
    a('walk: ld WI push 13 lt ld WJ push 13 lt and jz wdone push 2 call rmod jz incj ld WI push 1 add st WI jmp cont')
    a('incj: ld WJ push 1 add st WJ')
    a('cont: call addpt jmp walk')
    a('wdone: push 30 push 0x2f2f28 push 100 call poly push 22 push 0x49c5b1 push 100 call poly '
      'push 6 push 0xbfeee2 push 85 call poly next C 4 canal')
    a('push -1 stroke push 100 opacity')
    # buildings
    a('push 0 st S')
    a('sloop: ld S push 13 sub push 0 max st I')
    a('iloop: ld I push 13 le ld I ld S le and jz idone ld S ld I sub st J')
    a('ld I push 14 mul ld J add push 256 add ldx jnz inext')
    a('push 10 call rmod st T ld T push 1 lt jz notplaza')
    a('push 0xddd4ba fill ld I ld J call ix ld I ld J call iy call dia jmp inext')
    a('notplaza: ld T push 7 gt jz lowh push 6 push 9 call ri st H jmp hset')
    a('lowh: push 2 push 5 call ri st H')
    a('hset: ld T push 3 mod st DK')
    a('ld DK jnz c1 push 0x4b4a3f st TOP push 0x34332b st LF push 0x26251e st RF jmp cdone')
    a('c1: ld DK push 1 eq jz c2 push 0xf0e9d3 st TOP push 0xd8cfb3 st LF push 0xbfb598 st RF jmp cdone')
    if soft:
        a('c2: push 0x49c5b1 st TOP push 0x2e8f85 st LF push 0x1f6b64 st RF')
    else:
        a('c2: push 0x49c5b1 pat push 0x040404 mul xor st TOP push 0x2e8f85 st LF push 0x1f6b64 st RF')
    a('cdone: ld I ld J call ix st X ld I ld J call iy ld H push 22 mul sub st Y ld H push 22 mul st D')
    a('ld TOP fill ld X ld Y call dia')
    a('ld LF fill pbegin ld X push 36 sub ld Y push 18 add m push 36 push 18 lr push 0 ld D lr push -36 push -18 lr z pend')
    a('ld RF fill pbegin ld X push 36 add ld Y push 18 add m push -36 push 18 lr push 0 ld D lr push 36 push -18 lr z pend')
    # windows
    a('push 2 ld H push 3 gt add st WN')
    win_op = 'push 90' if soft else 'push 90 wear push 50 min sub'
    a('ld DK push 1 eq jz wl1 push 0x34332b fill push 100 opacity jmp wl2')
    a('wl1: push 0x8fe8d8 fill ' + win_op + ' opacity')
    a('wl2: push 0 st K')
    a('wloop: pbegin ld X push 36 sub push 6 add ld K push 10 mul add ld Y push 18 add push 6 add m '
      'push 7 push 4 lr push 0 push 11 lr push -7 push -4 lr z pend next K WN wloop push 100 opacity')
    # door + antenna
    a('ld H push 6 lt jnz nodoor')
    a('ld DK push 1 eq jz d1 push 0x26251e fill jmp d2')
    a('d1: push 0x123c36 fill')
    a('d2: pbegin ld X push 6 add ld Y push 18 add ld D add push 24 sub m push 0 push -11 lr '
      'push 10 push -12 push 20 push 0 qr push 0 push 11 lr z pend')
    a('push 18 push 42 call ri st AH push 0x26251e stroke push 3 swidth')
    a('ld X ld Y push 18 add ld X ld Y push 18 add ld AH sub line')
    a('push -1 stroke push 0x49c5b1 fill ld X ld Y push 18 add ld AH sub push 3 circle')
    a('nodoor: ld T push 6 eq ld T push 7 eq or jz inext')
    # roof detail
    a('push 2 call rmod st DI push 1 ld DI sub st DJ push 4 push 7 call ri st NN push 1 st K')
    a('rloop: ld H push 22 mul ld K push 13 mul sub st E2')
    a('ld I ld DI ld K mul add ld J ld DJ ld K mul add call ix st QX')
    a('ld I ld DI ld K mul add ld J ld DJ ld K mul add call iy ld E2 push 0 max sub st QY')
    a('push 0xefe8d2 fill ld QX ld QY call dia')
    a('push 0x34332b fill pbegin ld QX push 36 sub ld QY push 18 add m push 36 push 18 lr push 0 push 13 lr '
      'push -36 push -18 lr z pend nextle K NN rloop')
    a('inext: ld I push 1 add st I jmp iloop')
    a('idone: nextle S 26 sloop')
    # bubbles
    a('push 100 gopen push 0 st K')
    a('bloop: ld K ld N lt jz bdone push 3 call rmod jnz bskip')
    a('ld K push 512 add ldx push 2 call rmod jz bneg push 26 jmp bx2')
    a('bneg: push -26')
    a('bx2: add st BX ld K push 640 add ldx push 8 add st BY')
    a('push 0x49c5b1 fill push 22 opacity ld BX ld BY push 9 circle push 100 opacity '
      'push 0xbfeee2 fill ld BX ld BY push 3 circle')
    a('bskip: ld K push 1 add st K jmp bloop')
    a('bdone: gclose')
    # glow and rings
    a('push 6 push 6 call ix st GX push 6 push 6 call iy push 2 push 4 call ri push 22 mul sub st GY')
    a('push 0x1000000 fill ld GX ld GY push 110 circle push 0xffffff fill ld GX ld GY push 9 circle')
    a('push -1 fill push 2 swidth push 75 opacity push 14 st K')
    a('rings: ld K push 34 gt jz warm push 0x49c5b1 stroke jmp go')
    a('warm: push 0xe8923a stroke')
    a('go: ld GX ld GY ld K circle ld K push 7 add dup st K push 42 le jnz rings')
    a('push -1 fill push 0x3a3a33 stroke push 7 swidth push 100 opacity push 36 push 36 push 1528 push 1528 rect halt')
    # subroutines
    a('ix: sub push 36 mul push 800 add ret')
    a('iy: add push 13 sub push 18 mul push 770 add ret')
    a('dia: pbegin over over m push 36 push 18 lr push -36 push 18 lr push -36 push -18 lr z pend drop drop ret')
    a('addpt: push 1 ld WI push 14 mul ld WJ add push 256 add stx ld WI ld WJ call ix ld N push 512 add stx '
      'ld WI ld WJ call iy ld N push 640 add stx ld N push 1 add st N ret')
    a('poly: opacity stroke swidth push -1 fill pbegin ld P0 st K '
      'ld K push 512 add ldx ld K push 640 add ldx m ld K push 1 add st K')
    a('pl: ld K ld N lt jz pldone ld K push 512 add ldx ld K push 640 add ldx l ld K push 1 add st K jmp pl')
    a('pldone: pend ret')
    a('ri: over sub push 1 add call rmod add ret')
    if soft:
        a('rnd: ld RX ld RX push 11 shl xor ld RY st RX ld RZ st RY ld RW st RZ '
          'ld RW dup push 19 ushr xor swap dup push 8 ushr xor xor dup st RW ret')
        a('rmod: call rnd dup push 1 and st TM push 1 ushr over mod push 2 mul ld TM add swap mod ret')
    else:
        a('rmod: push 0 swap push 1 sub rndr ret')
    return '\n'.join(L)


def program(soft=True):
    return rvm.assemble(source(soft))


if __name__ == '__main__':
    for soft in (True, False):
        p = program(soft)
        print('soft' if soft else 'clean', len(p), 'bytes')
