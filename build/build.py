#!/usr/bin/env python3
"""쇼츠자판기 — build/{body.html,style.css,app.js} → 단일 index.html.

외부 CDN·폰트·이미지 요청이 0건이 되도록 CSS/JS/HTML을 전부 인라인한다.
빌드 후 외부 리소스 참조가 남아 있으면 실패로 처리한다.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"

css = (BUILD / "style.css").read_text(encoding="utf-8")
body = (BUILD / "body.html").read_text(encoding="utf-8")
js = (BUILD / "app.js").read_text(encoding="utf-8")

for name, text in (("style.css", css), ("body.html", body), ("app.js", js)):
    low = text.lower()
    if "</script" in low and name == "app.js":
        raise SystemExit("app.js 안에 </script 문자열이 있어 인라인할 수 없습니다.")
    if "</style" in low and name == "style.css":
        raise SystemExit("style.css 안에 </style 문자열이 있습니다.")

html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#070a0f">
<meta name="description" content="제품 영상 링크 하나로 쇼츠 대본·음성·자동 편집·업로드 문구까지 만드는 브라우저 앱. 설치 없이, 서버 없이, 키는 내 브라우저에만.">
<meta name="color-scheme" content="dark">
<title>쇼츠자판기 · 링크에서 쇼츠까지</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%A5%A4%3C/text%3E%3C/svg%3E">
<style>
{css}
</style>
</head>
<body>
{body}
<script>
{js}
</script>
</body>
</html>
"""

out = ROOT / "index.html"
out.write_text(html, encoding="utf-8")

# 외부 리소스(스크립트/스타일/폰트/이미지) 참조 검사 — <a href> 링크는 제외
ext = []
for m in re.finditer(r"<(?:script|link|img|iframe|source)\b[^>]*?(?:src|href)\s*=\s*['\"]([^'\"]+)['\"]", html, re.I):
    url = m.group(1)
    if url.startswith("http") or url.startswith("//"):
        ext.append(url)
if ext:
    raise SystemExit(f"외부 리소스 참조가 남아 있습니다: {ext[:5]}")

print("wrote", out, f"{len(html):,} chars (css {len(css):,} + body {len(body):,} + js {len(js):,})")
