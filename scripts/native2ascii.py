#!/usr/bin/env python3
"""把指定 .js 源文件里所有非 ASCII 字符转成 \\uXXXX 转义，原地覆盖。
用于绕过 fnOS service 启动 bun 1.3.9 时把 utf-8 源按 latin-1 解码的 bug。
仅在打包时跑，不影响开发体验。
"""
import sys, re, json, pathlib

def escape_non_ascii(text: str) -> str:
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        cp = ord(ch)
        if cp < 0x80:
            out.append(ch)
        else:
            # 处理代理对：emoji 等 BMP 外字符 (cp >= 0x10000)
            if 0xD800 <= cp <= 0xDBFF and i + 1 < n:
                low = ord(text[i+1])
                if 0xDC00 <= low <= 0xDFFF:
                    out.append("\\u{:04x}\\u{:04x}".format(cp, low))
                    i += 2
                    continue
            out.append("\\u{:04x}".format(cp))
        i += 1
    return "".join(out)

def main():
    paths = sys.argv[1:]
    if not paths:
        print("usage: native2ascii.py <files...>", file=sys.stderr)
        sys.exit(1)
    changed = 0
    for p in paths:
        path = pathlib.Path(p)
        if not path.is_file():
            continue
        src = path.read_text(encoding="utf-8")
        # 跳过纯 ASCII
        if all(ord(c) < 0x80 for c in src):
            continue
        dst = escape_non_ascii(src)
        path.write_text(dst, encoding="utf-8")
        changed += 1
        print(f"  escaped: {path}", file=sys.stderr)
    print(f"native2ascii: {changed} file(s) changed", file=sys.stderr)

if __name__ == "__main__":
    main()
