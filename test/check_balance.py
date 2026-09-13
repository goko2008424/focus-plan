# -*- coding: utf-8 -*-
# 轻量 JS 括号平衡检查（感知字符串/行注释/块注释），无 node 环境时的兜底
import sys

def check(path):
    src = open(path, encoding='utf-8').read()
    i, n = 0, len(src)
    stack = []
    pairs = {')': '(', ']': '[', '}': '{'}
    line = 1
    mode = None  # None | sq | dq | line | block
    while i < n:
        c = src[i]
        if c == '\n':
            line += 1
        if mode == 'sq' or mode == 'dq':
            q = "'" if mode == 'sq' else '"'
            if c == '\\':
                i += 2
                continue
            if c == q:
                mode = None
        elif mode == 'line':
            if c == '\n':
                mode = None
        elif mode == 'block':
            if c == '/' and src[i-1] == '*':
                mode = None
        else:
            if c == "'" and src[i-1] != '\\':
                mode = 'sq'
            elif c == '"' and src[i-1] != '\\':
                mode = 'dq'
            elif c == '/' and i+1 < n and src[i+1] == '/':
                mode = 'line'
            elif c == '/' and i+1 < n and src[i+1] == '*':
                mode = 'block'
            elif c in '([{':
                stack.append((c, line))
            elif c in ')]}':
                if not stack or stack[-1][0] != pairs[c]:
                    print('%s: MISMATCH %s at line %d' % (path, c, line))
                    return False
                stack.pop()
        i += 1
    if stack:
        print('%s: UNCLOSED %s' % (path, stack[-3:]))
        return False
    print('%s: balance OK' % path)
    return True

files = sys.argv[1:]
ok = all([check(f) for f in files]) if files else True
sys.exit(0 if ok else 1)
