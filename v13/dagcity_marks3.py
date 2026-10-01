"""marks2 with larger early marks: first 10 marks at 5x instead of 3x."""
import dagcity_marks2 as M, rvm
OLD = 'ld MK push 10 lt push 2 mul push 1 add st MM'
def source():
    s = M.source(); assert s.count(OLD) == 1
    return s.replace(OLD, 'ld MK push 10 lt push 4 mul push 1 add st MM')
def program():
    return rvm.assemble(source())
if __name__ == '__main__':
    p = program(); print(len(p), 'bytes', rvm.b2(p).hex())
