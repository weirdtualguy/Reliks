"""DAG-City clean port + accumulating marks: one small mark per sale (wear), at positions fixed by the serial.
Positions come from an xorshift32 stream seeded from lane 4 and the serial only (never lineage or wear) and the
built-in RNG is not touched, so the first n marks are identical at every wear >= n. Drawn before the glow and frame."""
import dagcity, rvm

VARS = '.var BX 32 .var BY 33 .var GX 34 .var GY 35'
ANCHOR = 'push 6 push 6 call ix st GX'
XS = 'ld MS dup push 13 shl xor st MS ld MS dup push 17 ushr xor st MS ld MS dup push 5 shl xor st MS '
MARKS = ('wear jz mkskip push -1 stroke push 0x5a4636 fill push 72 opacity '
         'lane 4 serial xor push 0x2545F491 xor st MS push 0 st MK '
         'mkloop: ld MK wear lt jz mkdone '
         + XS + 'ld MS push 8 ushr push 900 mod push 350 add st MX '
         + XS + 'ld MS push 8 ushr push 600 mod push 500 add st MY '
         'ld MK push 10 lt push 2 mul push 1 add st MM ld MX ld MY ld MS push 20 ushr push 18 mod push 8 add ld MM mul ld MS push 26 ushr push 6 mod push 3 add ld MM mul rect '
         'ld MK push 1 add st MK jmp mkloop mkdone: push 100 opacity mkskip:')


def source():
    s = dagcity.source(False)
    assert s.count(ANCHOR) == 1 and s.count(VARS) == 1
    s = s.replace(VARS, VARS + ' .var MS 200 .var MK 201 .var MX 202 .var MY 203 .var MM 204')
    return s.replace(ANCHOR, MARKS + '\n' + ANCHOR)


def program():
    return rvm.assemble(source())


if __name__ == '__main__':
    p = program()
    print(len(p), 'bytes', rvm.b2(p).hex())
