"""Marks program without the lineage-driven roof recolour: art ages only through accumulating marks."""
import dagcity_marks as M, rvm
OLD = 'push 0x49c5b1 pat push 0x040404 mul xor st TOP'
def source():
    s = M.source(); assert s.count(OLD) == 1
    return s.replace(OLD, 'push 0x49c5b1 st TOP')
def program():
    return rvm.assemble(source())
if __name__ == '__main__':
    p = program(); print(len(p), 'bytes', rvm.b2(p).hex())
