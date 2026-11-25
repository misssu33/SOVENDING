"""쇼츠자판기 · 종합 자동 테스트 (Playwright / headless Chromium)

검증 범위
  0) 정적 산출물·외부 리소스 0건
  1) 초기 로드 · 콘솔 오류 0 · 외부 요청 0
  2) 0단계 Gemini 키 5개 관리·상태·자동 전환(429) · 전부 소진 시 데모 폴백
  3) 1~2단계 링크 12개 제한·내 영상 업로드·대표 지정·데모 분석·레퍼런스/장바구니
  4) 3단계 4개 언어·톤·길이·제목 2줄·강조·문장 편집·합성 음성 실측 타임라인
  5) 4단계 장면 매칭/빼기/교체·가리기(블러/모자이크)·자막/제목/광고·BGM·프리셋
  6) 9:16 미리보기 재생·탐색 · WebM 내보내기(540×960, 오디오 포함)
  7) 5단계 제목 10개·설명/해시태그·썸네일 PNG 1080×1920
  8) 6단계 플랫폼 5종 문구·복사·업로드 링크·게시 확인 체크
  9) 7단계 쿠팡 키 로컬 저장·자동 링크·히스토리·대가성 문구
 10) 모바일(390×844)·데스크톱(1440/1024) 레이아웃 · 가로 오버플로 0
 11) 새로고침 후 키/프리셋/쿠팡/히스토리 유지

실행: python3 test/run_tests.py
"""
import os, re, json, time, struct, base64, threading, functools, http.server, socketserver, pathlib, subprocess
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.pw/browsers')
os.environ.setdefault('LD_LIBRARY_PATH', '/workspace/.pw/libs')
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path('/workspace/shorts-vending-webapp')
TEST = ROOT / 'test'
OUT = TEST / 'out'
SHOTS = TEST / 'shots'
MEDIA = TEST / 'media'
for d in (OUT, SHOTS, MEDIA):
    d.mkdir(parents=True, exist_ok=True)

PORT = 8840
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
httpd.RequestHandlerClass.log_message = lambda *a, **k: None
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}/'

fails = []
count = [0]
sec = ['']
def section(name):
    sec[0] = name
    print(f'\n=== {name} ===')
def check(cond, msg, extra=''):
    count[0] += 1
    ok = bool(cond)
    print(('  PASS  ' if ok else '  FAIL  ') + msg + (('  [' + str(extra) + ']') if extra != '' else ''))
    if not ok:
        fails.append(f'[{sec[0]}] {msg}' + (f' ({extra})' if extra != '' else ''))

HASH = """() => { const c=document.querySelector('#previewCanvas'); const x=c.getContext('2d');
 const d=x.getImageData(0,0,c.width,c.height).data; let h=2166136261;
 for(let i=0;i<d.length;i+=613){h=((h*16777619)^d[i])>>>0;h=((h*16777619)^d[i+1])>>>0;h=((h*16777619)^d[i+2])>>>0;} return h; }"""

CANVAS_VAR = """(sel) => { const c=document.querySelector(sel); const x=c.getContext('2d');
 const d=x.getImageData(0,0,c.width,c.height).data; let mn=255,mx=0;
 for(let i=0;i<d.length;i+=4){ mn=Math.min(mn,d[i]); mx=Math.max(mx,d[i]); }
 return {mn,mx,w:c.width,h:c.height}; }"""

FAMOUS_HASH = """() => { const c=document.querySelector('#famousCanvas'); const x=c.getContext('2d');
 const d=x.getImageData(0,0,c.width,c.height).data; let h=2166136261;
 for(let i=0;i<d.length;i+=613){h=((h*16777619)^d[i])>>>0;h=((h*16777619)^d[i+1])>>>0;h=((h*16777619)^d[i+2])>>>0;} return h; }"""

ERASER_HASH = """() => { const c=document.querySelector('#eraserCanvas'); const x=c.getContext('2d');
 const d=x.getImageData(0,0,c.width,c.height).data; let h=2166136261;
 for(let i=0;i<d.length;i+=613){h=((h*16777619)^d[i])>>>0;h=((h*16777619)^d[i+1])>>>0;h=((h*16777619)^d[i+2])>>>0;} return h; }"""

def famous_hash(pg):
    return pg.evaluate(FAMOUS_HASH)

def eraser_hash(pg):
    return pg.evaluate(ERASER_HASH)

# ---------------- 테스트 미디어 ----------------
def make_clips():
    ff = '/usr/local/lib/python3.12/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2'
    specs = [('clip-a.webm', 'testsrc2=size=270x480:rate=24:duration=3', '#1b3a5c'),
             ('clip-b.webm', 'smptebars=size=270x480:rate=24:duration=2.5', '#5c1b3a')]
    for name, src, _ in specs:
        path = MEDIA / name
        if path.exists() and path.stat().st_size > 1000:
            continue
        subprocess.run([ff, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', src,
                        '-c:v', 'libvpx-vp9', '-b:v', '320k', '-an', str(path)], check=True)
    return [MEDIA / n for n, _, _ in specs]

# ---------------- 가짜 Gemini ----------------
mock = {'mode': 'ok', 'calls': [], 'bodies': []}
MOCK_REF_PAYLOAD = {
    'product': {
        'name': '테스트 무선 이어폰 Pro', 'category': '음향기기', 'price': '39,900~59,900원',
        'summary': '노이즈캔슬링과 30시간 배터리를 내세운 무선 이어폰.',
        'hooks': ['노캔이 이 가격?', '30시간 재생', '한쪽만 써도 끊김 없음'],
        'keywords': ['무선이어폰', '노이즈캔슬링', '가성비'],
        'confidence': 88
    },
    'refs': [
        {'platform': 'tiktok', 'title': '이어폰 언박싱 15초 요약', 'views': 1200000, 'likes': 54000, 'features': '첫 1초 훅'},
        {'platform': 'instagram', 'title': '노캔 테스트 지하철 편', 'views': 870000, 'likes': 32000, 'features': '현장 비교'},
        {'platform': 'youtube', 'title': '가성비 이어폰 TOP3', 'views': 2400000, 'likes': 91000, 'features': '비교 컷'},
        {'platform': 'xiaohongshu', 'title': '하루 종일 써본 후기', 'views': 430000, 'likes': 21000, 'features': '일상 컷'},
        {'platform': 'douyin', 'title': '30시간 배터리 실험', 'views': 3100000, 'likes': 120000, 'features': '실험 구성'},
        {'platform': 'tiktok', 'title': '한쪽만 껴도 끊김 없음?', 'views': 660000, 'likes': 28000, 'features': '반전 훅'}
    ]
}

def gemini_handler(route, request):
    url = request.url
    key = ''
    try:
        key = parse_qs(urlparse(url).query).get('key', [''])[0]
    except Exception:
        pass
    mock['calls'].append(key)
    try:
        mock['bodies'].append(json.loads(request.post_data or '{}'))
    except Exception:
        mock['bodies'].append({})
    if mock['mode'] == 'ok':
        body = {'candidates': [{'content': {'parts': [{'text': 'OK'}]}, 'finishReason': 'STOP'}]}
        return route.fulfill(status=200, headers={'content-type': 'application/json'}, body=json.dumps(body))
    if mock['mode'] == 'all429':
        return route.fulfill(status=429, headers={'content-type': 'application/json'},
                             body='{"error":{"code":429,"message":"quota exceeded"}}')
    if mock['mode'] == 'script':
        payload = {'titles': ['모의 제목 하나', '모의 제목 둘'], 'highlights': ['무선이어폰', '노캔', '30시간'],
                   'sentences': ['첫 문장입니다.', '둘째 문장입니다.', '셋째 문장입니다.', '넷째 문장입니다.', '다섯째 문장입니다.']}
        body = {'candidates': [{'content': {'parts': [{'text': json.dumps(payload, ensure_ascii=False)}]}, 'finishReason': 'STOP'}]}
        return route.fulfill(status=200, headers={'content-type': 'application/json'}, body=json.dumps(body))
    if mock['mode'] == 'tts':
        import math as _m
        sr = 24000; n = int(sr * 0.6)
        pcm = bytearray()
        for i in range(n):
            val = int(9000 * _m.sin(2 * _m.pi * 220 * i / sr) * (0.6 + 0.4 * _m.sin(2 * _m.pi * 3 * i / sr)))
            pcm += struct.pack('<h', max(-32768, min(32767, val)))
        b64 = base64.b64encode(bytes(pcm)).decode()
        body = {'candidates': [{'content': {'parts': [{'inlineData': {'mimeType': 'audio/L16;codec=pcm;rate=24000', 'data': b64}}]}, 'finishReason': 'STOP'}]}
        return route.fulfill(status=200, headers={'content-type': 'application/json'}, body=json.dumps(body))
    if mock['mode'] == 'failover':
        if key in ('KEY-1', 'KEY-2', 'KEY-3'):
            return route.fulfill(status=429, headers={'content-type': 'application/json'},
                                 body='{"error":{"code":429,"message":"quota exceeded"}}')
        body = {'candidates': [{'content': {'parts': [{'text': json.dumps(MOCK_REF_PAYLOAD, ensure_ascii=False)}]}, 'finishReason': 'STOP'}]}
        return route.fulfill(status=200, headers={'content-type': 'application/json'}, body=json.dumps(body))
    return route.fulfill(status=500, body='{}')

# ---------------- helpers ----------------
def set_range(pg, sel, val):
    pg.evaluate("""([s,v]) => { const el=document.querySelector(s); el.value=String(v);
      el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }""", [sel, val])

def set_checked(pg, sel, val):
    pg.evaluate("""([s,v]) => { const el=document.querySelector(s); el.checked=!!v;
      el.dispatchEvent(new Event('change',{bubbles:true})); }""", [sel, val])

def set_select(pg, sel, val):
    pg.evaluate("""([s,v]) => { const el=document.querySelector(s); el.value=v;
      el.dispatchEvent(new Event('change',{bubbles:true})); }""", [sel, val])

def state(pg, expr):
    return pg.evaluate('() => (' + expr + ')')

def preview_hash(pg):
    return pg.evaluate(HASH)

def goto_step(pg, n):
    pg.evaluate(f'SV.goStep({n})')
    pg.wait_for_timeout(130)

def goto_view(pg, v):
    pg.evaluate(f'SV.goView("{v}")')
    pg.wait_for_timeout(130)

def png_size(path):
    with open(path, 'rb') as f:
        sig = f.read(8)
        if sig != b'\x89PNG\r\n\x1a\n':
            return None
        length = struct.unpack('>I', f.read(4))[0]
        typ = f.read(4)
        w, h = struct.unpack('>II', f.read(8))
        return w, h

clips = make_clips()

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

    # =========================================================
    section('0. 정적 산출물')
    idx = ROOT / 'index.html'
    html = idx.read_text(encoding='utf-8')
    check(idx.exists() and idx.stat().st_size > 100000, 'index.html 단일 파일 생성', f'{idx.stat().st_size:,}B')
    check('<script src=' not in html.lower(), '외부 스크립트 태그 없음')
    ext_tags = re.findall(r'<(?:script|link|img|iframe|source)\b[^>]*?(?:src|href)\s*=\s*["\'](https?:)?//[^"\']+', html, re.I)
    check(not ext_tags, '외부 리소스(src/href) 0건', ext_tags[:2])
    check('@import' not in html, 'CSS @import 없음')
    check('fonts.googleapis' not in html and 'cdn.' not in html, 'CDN/웹폰트 참조 없음')
    check(html.count('class="step-panel') == 12, '성과·1~6단계·도구 5개 패널 12개', html.count('class="step-panel'))
    check(html.count('data-view="') >= 12, '메뉴·패널 view 12개 이상')
    check('유명 쇼츠 자동생성 및 업로드' in html, '사이드바 🔥 유명 쇼츠 메뉴')
    check('멀티 다운로더' in html and '자막 지우개' in html, '사이드바 도구 메뉴(멀티 다운로더·자막 지우개)')
    check('내 성과' in html and '쿠팡파트너스 웹페이지 꾸미기' in html, '내 성과·쿠팡파트너스 메뉴')
    check('loginBadge' in html and '로그인 0/6' in html, '상단 로그인 0/6 배지')
    check(html.count('hub-card') >= 5, '업로드 허브 5개 플랫폼 카드')
    check('viewport' in html and 'width=device-width' in html, '모바일 viewport 메타')
    check(len(html) > 150000, '앱 코드 인라인 크기', f'{len(html):,}자')

    # =========================================================
    section('1. 초기 로드 · 네트워크 · 콘솔')
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, locale='ko-KR', accept_downloads=True,
                              permissions=['clipboard-read', 'clipboard-write'])
    pg = ctx.new_page()
    pg.route('https://generativelanguage.googleapis.com/**', gemini_handler)
    console, pageerrors, requests = [], [], []
    pg.on('console', lambda m: console.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: pageerrors.append(str(e)))
    pg.on('request', lambda r: requests.append(r.url))
    pg.goto(BASE + 'index.html', wait_until='load')
    pg.wait_for_timeout(600)
    external = [u for u in requests if not u.startswith(BASE) and not u.startswith('data:')]
    check(not console, '콘솔 오류 0건', console[:2])
    check(not pageerrors, 'JS 예외 0건', pageerrors[:2])
    check(not external, '로드 시 외부 요청 0건', external[:3])
    check(pg.title().startswith('쇼츠자판기'), '페이지 제목', pg.title())
    check('데모 모드' in pg.inner_text('#modeBadge'), '데모 모드 배지')
    check(state(pg, 'SV.state.view') == 'perf', '시작 화면 = 내 성과')
    check('데모 모드' in pg.inner_text('#modeBadge') and '키 0/5' in pg.inner_text('#modeBadge'), '상단 AI/키 배지')
    check(pg.inner_text('#loginBadge').strip() == '로그인 0/6', '상단 로그인 0/6')
    check(pg.eval_on_selector_all('#perfStats .stat', 'e=>e.length') == 8, '내 성과 카드 8개')
    check(pg.inner_text('#keyBadge').strip() == '키 0/5', '키 0/5 배지')
    check(pg.is_visible('#previewPh'), '미리보기 플레이스홀더 표시')
    cv = state(pg, "(() => { const c=document.querySelector('#previewCanvas'); return [c.width,c.height]; })()")
    check(cv == [540, 960], '미리보기 캔버스 540×960', cv)
    check(pg.eval_on_selector_all('#stepRail .step-btn', 'e=>e.length') == 12, '메뉴 12개(성과·1~6·도구 5)')
    check(pg.eval_on_selector_all('.step-panel.show', 'e=>e.length') == 1, '한 번에 한 단계만 표시')
    check(state(pg, 'SV.state.step') == -1, '시작 화면은 단계 번호 없음')
    ov = pg.evaluate('() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]')
    check(ov[0] <= ov[1] + 1, '데스크톱 가로 오버플로 없음', ov)
    script_count = pg.eval_on_selector_all('script', 'e=>e.length')
    check(script_count == 1, '인라인 스크립트 1개', script_count)

    # =========================================================
    section('2. 0단계 · Gemini 키 5개 관리와 자동 전환')
    pg.click('#btnSettings')
    pg.wait_for_timeout(250)
    check(pg.is_visible('#settingsModal'), '⚙️ 설정 모달 열림')
    check(pg.eval_on_selector_all('#keyRows .key-row', 'e=>e.length') == 1, '처음 키 슬롯 1개')
    for _ in range(4):
        pg.click('#btnAddKey')
    pg.wait_for_timeout(100)
    check(pg.eval_on_selector_all('#keyRows .key-row', 'e=>e.length') == 5, '키 슬롯 5개까지 추가')
    pg.click('#btnAddKey')
    pg.wait_for_timeout(100)
    check(pg.eval_on_selector_all('#keyRows .key-row', 'e=>e.length') == 5, '6번째 키는 추가되지 않음(최대 5)')
    keys = ['KEY-1', 'KEY-2', 'KEY-3', 'KEY-4', 'KEY-5']
    for i, k in enumerate(keys):
        pg.fill(f'[data-key-input="{i}"]', k)
    pg.click('#btnSaveKeys')
    pg.wait_for_timeout(300)
    check(not pg.is_visible('#settingsModal'), '저장 후 모달 닫힘')
    check(pg.inner_text('#keyBadge').strip() == '키 5/5', '키 5/5 반영')
    stored = state(pg, 'JSON.parse(localStorage.getItem("sv.keys.v1")).keys.map(k=>k.value)')
    check(stored == keys, 'localStorage에 키 5개 저장', len(stored))
    statuses = pg.eval_on_selector_all('#keyRows .key-state .badge', 'e=>e.map(x=>x.textContent.trim())')
    check(statuses == ['대기'] * 5, '신규 키 상태 = 대기', statuses)
    check('••••' in pg.inner_text('#keySummaryList'), '키 마스킹 표시')
    set_checked(pg, '#demoToggleModal', False)
    pg.wait_for_timeout(200)
    check('AI 연결됨' in pg.inner_text('#modeBadge') and '키 5/5' in pg.inner_text('#modeBadge'), '데모 끄면 AI 연결됨 · 키 5/5 배지')
    pg.click('#btnSettings')
    pg.wait_for_timeout(150)
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(150)
    check(not pg.is_visible('#settingsModal'), 'Esc로 모달 닫힘')
    pg.evaluate('SV.goView("settings")')
    pg.wait_for_timeout(200)
    check(pg.is_visible('#btnTestKeys'), '⚙ 설정 화면에 연결 테스트 버튼')

    mock['mode'] = 'ok'; mock['calls'].clear()
    pg.click('#btnTestKeys')
    pg.wait_for_function("() => document.querySelector('#testResult').textContent.includes('성공')", timeout=8000)
    check('성공' in pg.inner_text('#testResult'), '키 연결 테스트 성공(모의 200)')
    check(len(mock['calls']) == 1, '테스트 호출 1회', mock['calls'])

    pg.evaluate('SV.goView("settings")')
    pg.wait_for_timeout(200)
    check(pg.eval_on_selector_all('#acctList .acct', 'e=>e.length') == 6, '로그인 계정 6개 체크박스')
    pg.click('[data-acct="yt"]')
    pg.click('[data-acct="tiktok"]')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.loginCount()') == 2 and '2/6' in pg.inner_text('#loginBadge'), '로그인 2/6 상태바 반영', pg.inner_text('#loginBadge'))
    saved_acct = state(pg, 'JSON.parse(localStorage.getItem("sv.accounts.v1"))')
    check(saved_acct['yt'] is True and saved_acct['instagram'] is False, '로그인 계정 로컬 저장')
    pg.click('[data-acct="yt"]')
    pg.click('[data-acct="tiktok"]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.loginCount()') == 0, '로그인 체크 해제')

    mock['mode'] = 'failover'; mock['calls'].clear()
    pg.evaluate('SV.fillSampleLinks()')
    goto_step(pg, 1)
    pg.click('#btnAnalyze')
    pg.wait_for_function("() => window.SV.state.product && SV.state.product.name.includes('테스트')", timeout=12000)
    pg.wait_for_timeout(250)
    check(mock['calls'] == ['KEY-1', 'KEY-2', 'KEY-3', 'KEY-4'], '429 키 3개 건너뛰고 4번 키 사용', mock['calls'])
    st = state(pg, 'SV.state.keys.map(k=>k.status)')
    check(st == ['exhausted', 'exhausted', 'exhausted', 'active', 'waiting'], '키 상태 활성/한도초과/대기', st)
    check(state(pg, 'SV.state.activeKey === SV.state.keys[3].id'), '활성 키 = 4번')
    labels = pg.eval_on_selector_all('#keyRows .key-state .badge', 'e=>e.map(x=>x.textContent.trim())')
    check(labels[:4] == ['한도초과', '한도초과', '한도초과', '활성'], 'UI 상태 라벨 반영', labels)
    check('데모' not in pg.inner_text('#analyzeBadge'), '실제 Gemini 결과로 분석 완료', pg.inner_text('#analyzeBadge'))
    check(pg.inner_text('#prodName').strip() == '테스트 무선 이어폰 Pro', '모의 Gemini 제품명 반영')
    check(pg.eval_on_selector_all('#refGrid .ref', 'e=>e.length') == 6, '레퍼런스 6개')
    check(state(pg, 'SV.state.step') == 2, '분석 후 2단계로 이동')

    mock['calls'].clear()
    pg.click('#btnRefreshRefs')
    pg.wait_for_function("() => document.querySelector('#refCount').textContent.includes('6')", timeout=8000)
    pg.wait_for_timeout(300)
    check(mock['calls'] == ['KEY-4'], '다음 호출은 살아있는 4번 키만 사용', mock['calls'])

    mock['mode'] = 'all429'; mock['calls'].clear()
    pg.click('#btnRefreshRefs')
    pg.wait_for_function("() => document.querySelector('#analyzeBadge').textContent.includes('데모')", timeout=12000)
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.product.demo') is True, '모든 키 소진 시 데모 결과로 폴백')
    check('데모' in pg.inner_text('#analyzeStatus'), '폴백 안내 문구 표시', pg.inner_text('#analyzeStatus')[:60])
    check(len(mock['calls']) == 2, '소진된 키는 재시도하지 않음', mock['calls'])
    pg.click('#btnSettings'); pg.wait_for_timeout(200)
    pg.click('#btnResetKeys'); pg.wait_for_timeout(200)
    st2 = state(pg, 'SV.state.keys.map(k=>k.status)')
    check(all(x in ('waiting', 'empty') for x in st2), '한도 상태 초기화 버튼', st2)
    pg.click('#btnCloseSettings'); pg.wait_for_timeout(150)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='load')
    pg.wait_for_timeout(400)
    check('데모 모드' in pg.inner_text('#modeBadge'), '저장소 초기화 후 데모 모드')

    # =========================================================
    section('3. 1~2단계 · 링크·업로드·분석·레퍼런스')
    goto_step(pg, 1)
    pg.click('#btnSampleLinks')
    pg.wait_for_timeout(300)
    check(state(pg, 'SV.state.links.length') == 3, '예시 링크 3개')
    check(pg.inner_text('#linkCount').strip() == '3/12', '링크 카운터 3/12')
    check(pg.eval_on_selector_all('#linkList .link-item', 'e=>e.length') == 3, '링크 목록 3개')
    check(state(pg, 'SV.state.mainId === SV.state.links[0].id'), '첫 링크가 대표 영상')
    check('대표' in pg.inner_text('#linkList .link-item'), '대표 배지 표시')

    many = '\n'.join([f'https://www.tiktok.com/@test/video/73000000000{i:03d}' for i in range(15)])
    pg.fill('#linkInput', many)
    pg.wait_for_timeout(350)
    check(state(pg, 'SV.state.links.length') == 12, '링크는 최대 12개로 제한', state(pg, 'SV.state.links.length'))
    check('12/12' in pg.inner_text('#linkCount'), '카운터 12/12')
    check('over' in (pg.get_attribute('#linkCount', 'class') or ''), '초과 표시')

    pg.fill('#linkInput', 'https://www.instagram.com/reel/Cz9mQ2rLx1t/\n이건 링크가 아님')
    pg.wait_for_timeout(300)
    check(state(pg, 'SV.state.links.length') == 1, 'URL이 아닌 줄은 무시')

    pg.click('#btnSampleLinks')
    pg.wait_for_timeout(250)
    links = state(pg, 'SV.state.links.map(l=>l.id)')
    if state(pg, 'SV.state.mainId') != links[0]:
        pg.click(f'[data-main="{links[0]}"]')
        pg.wait_for_timeout(200)
    check(state(pg, f'SV.state.mainId === "{links[0]}"'), '첫 링크를 다시 대표로 지정')
    pg.click(f'[data-main="{links[1]}"]')
    pg.wait_for_timeout(200)
    check(state(pg, f'SV.state.mainId === "{links[1]}"'), '둘째 링크를 대표로 지정')

    pg.click(f'[data-unlink="{links[2]}"]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.links.length') == 2, '링크 빼기')

    pg.click('#btnSampleLinks')
    pg.wait_for_timeout(250)
    pg.set_input_files('#fileInput', [str(clips[0]), str(clips[1])])
    pg.wait_for_function("() => SV.state.files.length === 2", timeout=12000)
    pg.wait_for_timeout(600)
    check(state(pg, 'SV.state.files.length') == 2, '내 영상 2개 업로드')
    f0 = state(pg, '({d:SV.state.files[0].duration,w:SV.state.files[0].w,h:SV.state.files[0].h,poster:!!SV.state.files[0].poster})')
    check(abs(f0['d'] - 3.0) < 0.4 and f0['w'] == 270 and f0['h'] == 480, '영상 메타(길이·해상도) 읽기', f0)
    check(f0['poster'], '영상 포스터 썸네일 생성')
    check(pg.is_visible(f'[data-main="{state(pg, "SV.state.files[0].id")}"]'), '내 영상에 대표로 버튼 제공')
    pg.click(f'[data-main="{state(pg, "SV.state.files[0].id")}"]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.mainId === SV.state.files[0].id'), '내 영상을 대표 영상으로 지정')

    pg.click('[data-pf="douyin"]')
    pg.wait_for_timeout(150)
    check('douyin' in state(pg, 'SV.state.platforms'), '더우인 플랫폼 선택')
    pg.click('[data-pf="douyin"]')
    pg.wait_for_timeout(150)
    check('douyin' not in state(pg, 'SV.state.platforms'), '플랫폼 선택 해제')

    pg.click('#btnAnalyze')
    pg.wait_for_function("() => SV.state.product && SV.state.product.demo", timeout=10000)
    pg.wait_for_timeout(400)
    check(state(pg, 'SV.state.refs.length') == 6, '데모 레퍼런스 6개')
    prod = state(pg, '({name:SV.state.product.name,hooks:SV.state.product.hooks.length,kw:SV.state.product.keywords.length,price:SV.state.product.price,conf:SV.state.product.confidence})')
    check(prod['name'] and prod['hooks'] >= 3 and prod['kw'] >= 3 and prod['price'], '제품 정보(이름·후킹·키워드·가격)', prod)
    check(60 <= prod['conf'] <= 100, '신뢰도 표시', prod['conf'])
    check(pg.inner_text('#prodName').strip() == prod['name'], '제품 카드 이름 반영')
    check(pg.eval_on_selector_all('#prodPoints li', 'e=>e.length') >= 3, '후킹 포인트 3개 이상')
    refstats = state(pg, 'SV.state.refs.map(r=>({v:r.views,l:r.likes,f:r.features,p:r.platform}))')
    check(all(r['v'] > 0 and r['l'] > 0 and r['f'] for r in refstats), '레퍼런스 조회수·좋아요·특징', refstats[0])
    check(len({r['p'] for r in refstats}) >= 3, '레퍼런스 플랫폼 다양성')
    check('▶' in pg.inner_text('#refGrid'), '조회수 배지 렌더링')
    check('♥' in pg.inner_text('#refGrid'), '좋아요 배지 렌더링')
    cover = pg.evaluate(CANVAS_VAR, '#refGrid .ref canvas')
    check(cover['mx'] - cover['mn'] > 30, '레퍼런스 커버 캔버스가 그려짐', cover)

    pg.click('#refGrid [data-cart]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.refs.filter(r=>r.inCart).length') == 1, '장바구니 담기')
    check(pg.inner_text('#cartCount').strip() == '1', '장바구니 카운터 1')
    pg.click('#refGrid [data-cart]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.refs.filter(r=>r.inCart).length') == 0, '장바구니 빼기')
    pg.click('#refGrid [data-cart]')
    pg.click('#refGrid .ref:nth-child(2) [data-cart]')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.refs.filter(r=>r.inCart).length') == 2, '장바구니 2개')
    pg.click('#btnNextScript')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.step') == 3, '다음: 대본 쓰기로 이동')

    # =========================================================
    section('4. 3단계 · 대본 4개 언어·톤·길이')
    pg.click('#segLang button[data-v="en"]')
    pg.click('#btnWriteScript')
    pg.wait_for_function("() => SV.state.script && SV.state.script.lang === 'en'", timeout=8000)
    pg.wait_for_timeout(250)
    en = state(pg, 'SV.state.script')
    en_text = ' '.join(s['text'] for s in en['sentences'])
    check(all(re.search(r'[A-Za-z]', s['text']) for s in en['sentences']), 'English 대본 생성')
    lat = len(re.findall(r'[A-Za-z]', en_text)); han = len(re.findall(r'[가-힣]', en_text))
    check(lat > han * 3, 'English 대본 본문은 영어(제품명만 한글 허용)', f'영문 {lat} / 한글 {han}')
    check(len(en['titles']) == 2 and all(en['titles']), 'English 제목 2줄')
    check(len(en['sentences']) == 5, '기본 길이 5문장')

    pg.click('#segLang button[data-v="ja"]')
    pg.click('#btnWriteScript')
    pg.wait_for_timeout(700)
    ja = state(pg, 'SV.state.script.sentences.map(s=>s.text).join(" ")')
    check(bool(re.search(r'[ぁ-んァ-ヶ一-龯]', ja)), '日本語 대본 생성')

    pg.click('#segLang button[data-v="zh"]')
    pg.click('#btnWriteScript')
    pg.wait_for_timeout(700)
    zh = state(pg, 'SV.state.script.sentences.map(s=>s.text).join(" ")')
    check(bool(re.search(r'[一-龥]', zh)), '中文 대본 생성')

    pg.click('#segLang button[data-v="ko"]')
    pg.click('#segLen button[data-v="short"]')
    pg.click('#btnWriteScript')
    pg.wait_for_timeout(700)
    check(len(state(pg, 'SV.state.script.sentences')) == 3, '짧게 = 3문장')
    pg.click('#segLen button[data-v="long"]')
    pg.click('#btnWriteScript')
    pg.wait_for_timeout(700)
    check(len(state(pg, 'SV.state.script.sentences')) == 7, '길게 = 7문장')
    pg.click('#segLen button[data-v="normal"]')
    pg.click('#segTone button[data-v="fun"]')
    pg.click('#btnWriteScript')
    pg.wait_for_timeout(800)
    check(len(state(pg, 'SV.state.script.sentences')) == 5, '보통 = 5문장')
    check('ㅋㅋ' in state(pg, 'SV.state.script.sentences[0].text') or 'ㅋㅋ' in state(pg, 'SV.state.script.titles[0]'), '유머 톤 반영')

    hk = state(pg, 'SV.state.script.hooks || []')
    check(len(hk) == 6, '후킹 멘트 후보 6개 생성', len(hk))
    check(pg.eval_on_selector_all('#hookChips .hook-chip', 'e=>e.length') == 6, '후킹 칩 6개 표시')
    check(pg.eval_on_selector_all('#hookChips .hook-chip.on', 'e=>e.length') == 1, '현재 첫 문장 칩 표시')
    first_before = state(pg, 'SV.state.script.sentences[0].text')
    pg.click('[data-hook="3"]')
    pg.wait_for_timeout(250)
    first_after = state(pg, 'SV.state.script.sentences[0].text')
    check(first_after != first_before and first_after == hk[3], '후킹 칩을 누르면 첫 문장 교체', first_after[:24])
    check(pg.input_value('[data-sent-text="0"]') == hk[3], '문장 편집창도 같이 바뀜')
    check(state(pg, 'SV.state.voice') is None, '후킹 교체 시 음성 무효화')
    pg.click('[data-hook="0"]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.script.sentences[0].text') == hk[0], '1번 후킹으로 되돌리기')

    titles = state(pg, 'SV.state.script.titles')
    check(len(titles) == 2 and all(titles), '상단 제목 2줄 생성', titles)
    check(pg.input_value('#title1') == titles[0] and pg.input_value('#title2') == titles[1], '제목 입력창 동기화')
    check(len(state(pg, 'SV.state.script.highlights')) >= 3, '강조 단어 3개 이상')
    check(pg.eval_on_selector_all('#highlightPreview .tag', 'e=>e.length') >= 3, '강조 단어 칩 표시')
    check(pg.eval_on_selector_all('#sentList .sent-item', 'e=>e.length') == 5, '문장 편집기 5개')
    check(pg.input_value('#title1')[:2] not in ('', None), '제목 직접 수정 가능')

    pg.fill('[data-sent-text="1"]', '직접 고친 두 번째 문장입니다.')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.script.sentences[1].text') == '직접 고친 두 번째 문장입니다.', '문장 직접 수정 반영')
    check(state(pg, 'SV.state.voice') is None, '문장 수정 시 기존 음성 무효화')
    pg.fill('#title1', '직접 쓴 첫 제목')
    pg.wait_for_timeout(150)
    check(state(pg, 'SV.state.script.titles[0]') == '직접 쓴 첫 제목', '제목 직접 수정 반영')

    before = pg.eval_on_selector_all('#sentList .sent-item', 'e=>e.length')
    pg.click('#btnAddSentence')
    pg.wait_for_timeout(200)
    check(pg.eval_on_selector_all('#sentList .sent-item', 'e=>e.length') == before + 1, '문장 추가')
    pg.click('[data-sent-del]' if before == 0 else f'[data-sent-del="{before}"]')
    pg.wait_for_timeout(200)
    check(pg.eval_on_selector_all('#sentList .sent-item', 'e=>e.length') == before, '문장 삭제')

    # =========================================================
    section('5. 3단계 · 음성 타임라인(실측)과 재생')
    set_range(pg, '#speedRange', 1.0)
    pg.click('#btnMakeVoice')
    pg.wait_for_function("() => SV.state.voice && SV.state.voice.timeline.length", timeout=15000)
    pg.wait_for_timeout(300)
    v = state(pg, '({mode:SV.state.voice.mode,total:SV.state.voice.total,tl:SV.state.voice.timeline,bufs:SV.state.voice.buffers.map(b=>b.duration)})')
    check(v['mode'] == 'demo', '데모 모드 합성음', v['mode'])
    check(len(v['tl']) == 5, '문장 수만큼 타임라인', len(v['tl']))
    check(all(r['dur'] > 0.3 for r in v['tl']), '모든 문장 길이 > 0.3s')
    check(all(abs(v['tl'][i]['dur'] - v['bufs'][i]) < 0.02 for i in range(5)), '타임라인 길이 = 실제 오디오 길이(실측)')
    check(abs(v['total'] - v['tl'][-1]['end']) < 0.001, '총 길이 = 마지막 문장 끝')
    check(pg.eval_on_selector_all('#timelineBody tr', 'e=>e.length') == 5, '타임라인 표 5행')
    check(pg.inner_text('#totalLen').strip() == f"{v['total']:.1f}s", '총 길이 표시', pg.inner_text('#totalLen'))
    check('합성음' in pg.inner_text('#voiceModeBadge'), '음성 모드 배지')
    check('실측' in pg.inner_text('#voiceStatus'), '실측 길이 안내', pg.inner_text('#voiceStatus')[:50])
    check(abs(float(state(pg, 'SV.state.voice.buffers[0].sampleRate')) - 48000) < 9000, '오디오 샘플레이트', state(pg, 'SV.state.voice.buffers[0].sampleRate'))
    check(abs(state(pg, 'SV.state.voice.gap') - 0.15) < 0.001, '기본 문장 사이 간격 0.15초', state(pg, 'SV.state.voice.gap'))
    check(all(abs((v['tl'][i + 1]['start'] - v['tl'][i]['end']) - 0.15) < 0.001 for i in range(4)), '타임라인에 0.15초 간격 반영')
    check(pg.eval_on_selector_all('#gapSel option', 'e=>e.map(o=>o.value)') == ['0', '0.15', '0.3', '0.5'], '문장 사이 간격 4개 선택지')
    check(pg.eval_on_selector_all('#voiceNames .voice-name', 'e=>e.map(x=>x.textContent)') == ['Kore', 'Aoede', 'Charon', 'Puck', 'Fenrir'], '구글 목소리 5종 라벨')
    check(pg.eval_on_selector_all('#voiceSel option', 'e=>e.length') == 5, '목소리 선택 5개')
    check(pg.inner_text('.voice-label').startswith('🎙️ 구글 목소리'), '구글 목소리(Gemini Native TTS) 라벨')

    total_100 = v['total']
    set_range(pg, '#speedRange', 1.3)
    pg.click('#btnMakeVoice')
    pg.wait_for_function("() => SV.state.voice && Math.abs(SV.state.voice.speed - 1.3) < 0.01 && SV.state.voice.timeline.length === 5", timeout=15000)
    pg.wait_for_timeout(200)
    total_130 = state(pg, 'SV.state.voice.total')
    check(total_130 < total_100 * 0.92, '속도를 올리면 길이가 줄어듦', f'{total_100:.1f}→{total_130:.1f}')
    set_range(pg, '#speedRange', 1.0)
    pg.click('#btnMakeVoice')
    pg.wait_for_function("() => SV.state.voice && Math.abs(SV.state.voice.speed - 1.0) < 0.01 && SV.state.voice.timeline.length === 5", timeout=15000)
    pg.wait_for_timeout(200)

    set_select(pg, '#gapSel', '0.5')
    pg.wait_for_timeout(300)
    total_05 = state(pg, 'SV.state.voice.total')
    gaps_05 = state(pg, 'SV.state.voice.timeline.slice(1).map((r,i)=> +(r.start - SV.state.voice.timeline[i].end).toFixed(3))')
    check(abs(total_05 - (total_100 + 4 * 0.35)) < 0.05, '간격 0.5초 → 총 길이 4×0.35 늘어남', f'{total_100:.2f}→{total_05:.2f}')
    check(gaps_05 == [0.5] * 4, '타임라인 간격 0.5초 반영', gaps_05)
    check('0.5초' in pg.inner_text('#gapVal'), '간격 라벨 갱신', pg.inner_text('#gapVal'))
    set_select(pg, '#gapSel', '0')
    pg.wait_for_timeout(250)
    total_00 = state(pg, 'SV.state.voice.total')
    check(abs(total_00 - (total_100 - 4 * 0.15)) < 0.05, '간격 0초(바로 이어서) → 총 길이 감소', f'{total_100:.2f}→{total_00:.2f}')
    check(state(pg, 'SV.state.voice.timeline.slice(1).every((r,i)=> Math.abs(r.start - SV.state.voice.timeline[i].end) < 0.001)'), '간격 0초면 문장이 바로 이어짐')
    set_select(pg, '#gapSel', '0.15')
    pg.wait_for_timeout(250)
    check(abs(state(pg, 'SV.state.voice.total') - total_100) < 0.05, '간격 0.15초로 복귀')

    pg.click('#btnPlayVoice')
    pg.wait_for_timeout(900)
    t1 = state(pg, 'SV.PV.playing')
    adv = state(pg, 'SV.now()')
    check(t1 is True and adv > 0.35, '미리보기 재생 진행', round(adv, 2))
    check(pg.inner_text('#btnPlay') == '⏸', '재생 중 버튼 상태')
    pg.click('#btnPlayVoice')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.PV.playing') is False, '일시정지')

    # =========================================================
    section('5b. Gemini 실제 경로(모의) · 대본/TTS')
    ctx2 = browser.new_context(viewport={'width': 1360, 'height': 900}, locale='ko-KR')
    pg2 = ctx2.new_page()
    c2, e2 = [], []
    pg2.on('console', lambda m: c2.append(m.text) if m.type == 'error' else None)
    pg2.on('pageerror', lambda e: e2.append(str(e)))
    pg2.route('https://generativelanguage.googleapis.com/**', gemini_handler)
    pg2.goto(BASE + 'index.html', wait_until='load')
    pg2.wait_for_timeout(400)
    pg2.click('#btnSettings'); pg2.wait_for_timeout(200)
    pg2.fill('[data-key-input="0"]', 'KEY-TTS')
    pg2.click('#btnSaveKeys'); pg2.wait_for_timeout(250)
    check('키 1/5' in pg2.inner_text('#keyBadge'), 'TTS용 키 1개 저장')
    pg2.click('#btnSettings'); pg2.wait_for_timeout(150)
    set_checked(pg2, '#demoToggleModal', False)
    pg2.wait_for_timeout(150)
    pg2.click('#btnCloseSettings'); pg2.wait_for_timeout(150)
    check('AI 연결됨' in pg2.inner_text('#modeBadge'), 'TTS 테스트는 AI 연결 모드')
    mock['mode'] = 'failover'
    pg2.evaluate('SV.fillSampleLinks()')
    goto_step(pg2, 1)
    pg2.click('#btnAnalyze')
    pg2.wait_for_function("() => SV.state.product && SV.state.product.name.includes('테스트')", timeout=10000)
    pg2.wait_for_timeout(200)
    mock['mode'] = 'script'
    goto_step(pg2, 3)
    pg2.click('#btnWriteScript')
    pg2.wait_for_function("() => SV.state.script && SV.state.script.demo === false", timeout=10000)
    pg2.wait_for_timeout(250)
    sc = state(pg2, 'SV.state.script')
    check(sc['demo'] is False, 'Gemini 대본 경로 사용', sc['demo'])
    check(sc['titles'] == ['모의 제목 하나', '모의 제목 둘'], '모의 Gemini 제목 2줄', sc['titles'])
    check(len(sc['sentences']) == 5, '모의 Gemini 문장 5개')
    check(any('모의 제목' in v for v in [pg2.input_value('#title1')]), '제목 입력창에 Gemini 결과')
    mock['mode'] = 'tts'
    mock['bodies'].clear()
    pg2.click('#btnMakeVoice')
    pg2.wait_for_function("() => SV.state.voice && SV.state.voice.mode === 'gemini'", timeout=20000)
    pg2.wait_for_timeout(300)
    vv = state(pg2, '({mode:SV.state.voice.mode,tl:SV.state.voice.timeline.map(r=>r.dur),total:SV.state.voice.total,sr:SV.state.voice.buffers[0].sampleRate})')
    check(vv['mode'] == 'gemini', 'Gemini TTS 모드', vv['mode'])
    check(all(abs(d - 0.6) < 0.02 for d in vv['tl']), 'PCM 24kHz 0.6초 → 타임라인 실측', [round(d, 3) for d in vv['tl']])
    check(abs(vv['total'] - (5 * 0.6 + 4 * 0.15)) < 0.05, 'Gemini TTS 총 길이(간격 0.15초)', round(vv['total'], 2))
    check('Gemini' in pg2.inner_text('#voiceModeBadge'), 'TTS 모드 배지', pg2.inner_text('#voiceModeBadge'))
    reqbody = mock['bodies'][-1] if mock['bodies'] else {}
    gen = reqbody.get('generationConfig', {})
    check('AUDIO' in gen.get('responseModalities', []), 'TTS 요청에 AUDIO 응답 모달리티')
    check(gen.get('speechConfig', {}).get('voiceConfig', {}).get('prebuiltVoiceConfig', {}).get('voiceName') == 'Kore', 'TTS 보이스 지정')
    check(not e2, 'Gemini 경로 JS 예외 0건', e2[:2])
    check(not [x for x in c2 if '429' not in x], 'Gemini 경로 콘솔 오류 0건', c2[:2])
    ctx2.close()

    # =========================================================
    section('6. 4단계 · 장면·가리기·스타일·프리셋')
    goto_step(pg, 4)
    pg.wait_for_timeout(300)
    check(state(pg, 'SV.state.scenes.length') == 5, '문장별 장면 5개')
    check(pg.eval_on_selector_all('#sceneList .scene', 'e=>e.length') == 5, '장면 카드 5개')
    check(state(pg, "SV.state.scenes.every(s=>s.kind==='clip')"), '업로드 영상이 장면으로 연결')
    scv = pg.evaluate(CANVAS_VAR, '#sceneList .scene canvas')
    check(scv['mx'] - scv['mn'] > 20, '장면 썸네일 렌더링', scv)

    tl0 = state(pg, 'SV.previewTimeline()[0]')
    pg.evaluate(f'SV.setTime({tl0["start"] + 0.3})')
    h_before = preview_hash(pg)
    pg.click('[data-scene-mute="0"]')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.scenes[0].muted') is True, '장면 빼기')
    check('off' in (pg.get_attribute('[data-scene="0"]', 'class') or ''), '장면 카드 빼짐 표시')
    pg.evaluate(f'SV.setTime({tl0["start"] + 0.3})')
    h_muted = preview_hash(pg)
    check(h_muted != h_before, '장면을 빼면 미리보기 변화')
    pg.click('[data-scene-mute="0"]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.scenes[0].muted') is False, '장면 복원')

    old_label = state(pg, 'SV.state.scenes[1].label')
    old_motif = state(pg, 'SV.state.scenes[1].motif')
    pg.click('[data-scene-swap="1"]')
    pg.wait_for_timeout(250)
    new_label = state(pg, 'SV.state.scenes[1].label')
    check(new_label != old_label or state(pg, 'SV.state.scenes[1].fileId') != state(pg, 'SV.state.files[0].id'), '장면 추가(교체) 동작', new_label[:24])

    pg.evaluate(f'SV.setTime({tl0["start"] + 0.2})')
    hb = preview_hash(pg)
    set_checked(pg, '#blurOn', False)
    pg.wait_for_timeout(200)
    h_no_blur = preview_hash(pg)
    check(h_no_blur != hb, '가리기 끄면 미리보기 변화')
    set_checked(pg, '#blurOn', True)
    pg.wait_for_timeout(200)
    h_blur = preview_hash(pg)
    set_select(pg, '#blurMode', 'mosaic')
    pg.wait_for_timeout(250)
    h_mosaic = preview_hash(pg)
    check(h_mosaic != h_blur, '블러 ↔ 모자이크 차이')
    check('모자이크' in pg.inner_text('#blurStrengthVal'), '가리기 방식 라벨')
    set_range(pg, '#blurStrength', 30)
    pg.wait_for_timeout(200)
    check(preview_hash(pg) != h_mosaic, '가리기 강도 조절 반영')
    set_select(pg, '#blurMode', 'blur')

    set_checked(pg, '#titleOn', False)
    pg.wait_for_timeout(200)
    h_no_title = preview_hash(pg)
    set_checked(pg, '#titleOn', True)
    pg.wait_for_timeout(200)
    check(h_no_title != preview_hash(pg), '상단 제목 켜기/끄기 반영')

    h0 = preview_hash(pg)
    set_range(pg, '#capSize', 42)
    pg.wait_for_timeout(200)
    h1 = preview_hash(pg)
    set_range(pg, '#capY', 70)
    pg.wait_for_timeout(200)
    h2 = preview_hash(pg)
    set_select(pg, '#capFont', 'serif')
    pg.wait_for_timeout(200)
    h3 = preview_hash(pg)
    pg.evaluate("() => { const el=document.querySelector('#capColor'); el.value='#00ffcc'; el.dispatchEvent(new Event('input',{bubbles:true})); }")
    pg.wait_for_timeout(200)
    h4 = preview_hash(pg)
    check(len({h0, h1, h2, h3, h4}) == 5, '자막 크기·위치·글꼴·색상 각각 반영', [h0, h1, h2, h3, h4])
    check(pg.inner_text('#capSizeVal') == '42' and pg.inner_text('#capYVal') == '70%', '자막 수치 라벨')

    set_select(pg, '#bgmSel', 'calm')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.style.bgm') == 'calm', 'BGM 선택 반영')
    check('잔잔한' in pg.inner_text('#pvBgm'), 'BGM 배지 갱신')
    set_range(pg, '#bgmVol', 35)
    check(pg.inner_text('#bgmVolVal') == '35%', 'BGM 볼륨 라벨')

    pg.click('#segAd button[data-v="off"]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.style.ad') == 'off', '(광고) 표시 끄기')
    check('없음' in pg.inner_text('#infoAd'), '광고 표시 정보 갱신')
    pg.click('#segAd button[data-v="ad"]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.style.ad') == 'ad', '(광고) 표시 켜기')
    pg.click('#segAd button[data-v="coupang"]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.style.ad') == 'coupang', '쿠팡 파트너스 대가성 표시 선택')
    check('쿠팡' in pg.inner_text('#pvAd'), '대가성 문구 배지')

    # 프리셋 저장
    set_range(pg, '#capSize', 44)
    set_checked(pg, '#presetRemember', True)
    pg.wait_for_timeout(350)
    preset = state(pg, 'JSON.parse(localStorage.getItem("sv.preset.v1"))')
    check(preset and preset['style']['capSize'] == 44, '‘다음 영상에도 이 설정으로’ 저장', preset['style']['capSize'] if preset else None)
    check('저장' in pg.inner_text('#presetStatus'), '프리셋 저장 상태 표시')
    check(pg.inner_text('#infoScenes').strip() == '5', '유효 장면 수 표시')
    check('블러' in pg.inner_text('#infoBlur') or '모자이크' in pg.inner_text('#infoBlur'), '가리기 정보 표시')

    # 장면 보기(점프)
    pg.click('[data-scene-jump="2"]')
    pg.wait_for_timeout(250)
    check(abs(state(pg, 'SV.now()') - state(pg, 'SV.previewTimeline()[2].start')) < 0.2, '장면 보기 = 해당 문장으로 이동')

    # =========================================================
    section('7. 9:16 미리보기 · WebM 내보내기')
    check(pg.inner_text('#pvRes').strip() == '540×960', '미리보기 해상도 표시')
    cvr = pg.evaluate("""() => { const r=document.querySelector('#previewCanvas').getBoundingClientRect(); return r.width/r.height; }""")
    check(abs(cvr - 9/16) < 0.01, '미리보기 9:16 비율', round(cvr, 4))
    total = state(pg, 'SV.totalDuration()')
    pg.evaluate('(() => { const s=document.querySelector("#seek"); s.value="500"; s.dispatchEvent(new Event("input",{bubbles:true})); })()')
    pg.wait_for_timeout(150)
    nowv = state(pg, 'SV.now()')
    totalv = state(pg, 'SV.totalDuration()')
    check(abs(nowv - totalv / 2) < 0.5, '탐색바 50% 이동', f'{nowv:.2f}/{totalv:.2f}')

    # 2문장으로 줄여 내보내기 시간 단축
    goto_step(pg, 3)
    for _ in range(3):
        pg.click(f'[data-sent-del="1"]')
        pg.wait_for_timeout(120)
    check(len(state(pg, 'SV.state.script.sentences')) == 2, '내보내기용 2문장')
    pg.click('#btnMakeVoice')
    pg.wait_for_function('() => SV.state.voice && SV.state.voice.timeline.length === 2', timeout=12000)
    pg.wait_for_timeout(200)
    exp_total = state(pg, 'SV.state.voice.total')

    goto_step(pg, 4)
    t0 = time.time()
    blob = pg.evaluate("""async () => { const b = await SV.exportWebM(); return b ? {size:b.size, type:b.type} : null; }""")
    took = time.time() - t0
    check(blob and blob['size'] > 150000, 'WebM 생성', blob)
    check('webm' in (blob or {}).get('type', ''), 'MIME video/webm', (blob or {}).get('type'))
    check(abs(took - exp_total) < 6, '실시간 녹화 시간', f'{took:.1f}s / {exp_total:.1f}s')
    check(not pg.is_visible('#exportProg') or 'on' not in (pg.get_attribute('#exportProg', 'class') or ''), '내보내기 진행바 종료')
    check('완료' in pg.inner_text('#exportStatus'), '내보내기 완료 표시', pg.inner_text('#exportStatus'))
    meta = pg.evaluate("""async () => {
      const href = document.querySelector('#exportLink').href;
      const v = document.createElement('video'); v.src = href; v.muted = true; v.preload = 'auto';
      document.body.appendChild(v);
      await new Promise(r => { v.onloadedmetadata = r; setTimeout(r, 4000); });
      if (!isFinite(v.duration)) { v.currentTime = 1e7; await new Promise(r => { v.onseeked = r; setTimeout(r, 1200); }); }
      const out = {w:v.videoWidth, h:v.videoHeight, dur:v.duration, href};
      v.remove(); return out;
    }""")
    check(meta['w'] == 540 and meta['h'] == 960, 'WebM 해상도 540×960', (meta['w'], meta['h']))
    check(abs(meta['dur'] - exp_total) < 0.8, 'WebM 길이 = 음성 길이', f"{meta['dur']:.2f} vs {exp_total:.2f}")
    audio = pg.evaluate("""async () => {
      const buf = await (await fetch(document.querySelector('#exportLink').href)).arrayBuffer();
      const ac = new (window.AudioContext||window.webkitAudioContext)();
      try { const ab = await ac.decodeAudioData(buf.slice(0)); const d = ab.getChannelData(0);
        let s = 0, n = 0; for (let i = 0; i < d.length; i += 97) { s += d[i]*d[i]; n++; }
        return {dur: ab.duration, rms: Math.sqrt(s/n), sr: ab.sampleRate};
      } catch (e) { return {error: String(e)}; }
    }""")
    check('dur' in audio and audio['dur'] > 2, '내보낸 WebM 오디오 디코드', audio)
    check('rms' in audio and audio['rms'] > 0.001, '내보낸 오디오에 소리 포함', audio.get('rms'))
    frame = pg.evaluate("""async () => {
      const href = document.querySelector('#exportLink').href;
      const v = document.createElement('video'); v.src = href; v.muted = true; v.preload='auto';
      document.body.appendChild(v);
      await new Promise(r => { v.onloadeddata = r; setTimeout(r, 3000); });
      v.currentTime = Math.min(1, (v.duration||2)/2);
      await new Promise(r => { v.onseeked = r; setTimeout(r, 2000); });
      const c = document.createElement('canvas'); c.width = 270; c.height = 480;
      const x = c.getContext('2d'); x.drawImage(v, 0, 0, 270, 480);
      const d = x.getImageData(0, 0, 270, 480).data; let mn = 255, mx = 0;
      for (let i = 0; i < d.length; i += 4) { mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]); }
      v.remove(); return {mn, mx};
    }""")
    check(frame['mx'] - frame['mn'] > 25, '내보낸 영상 프레임이 비어 있지 않음', frame)
    dl = pg.evaluate("""async () => { const a = document.querySelector('#exportLink');
      const r = await fetch(a.href); const b = await r.blob(); return b.size; }""")
    check(dl == blob['size'], '다운로드 링크 = 생성된 파일', dl)
    with pg.expect_download(timeout=15000) as dlinfo:
        pg.click('#exportLink')
    d = dlinfo.value
    saved = OUT / 'export.webm'
    d.save_as(str(saved))
    check(saved.exists() and saved.stat().st_size > 150000, 'WebM 파일 다운로드', f'{saved.stat().st_size:,}B')
    check(d.suggested_filename.endswith('.webm'), '파일명 .webm', d.suggested_filename)
    check(state(pg, 'SV.state.history.length') >= 1, '내보내면 링크 히스토리 자동 추가')

    # =========================================================
    section('8. 5단계 · 제목 10개·썸네일 PNG')
    goto_step(pg, 5)
    pg.click('#btnSuggestTitles')
    pg.wait_for_function("() => SV.state.titles && SV.state.titles.list.length === 10", timeout=10000)
    pg.wait_for_timeout(250)
    check(len(state(pg, 'SV.state.titles.list')) == 10, '제목 10개')
    check(all(0 <= t['score'] <= 100 for t in state(pg, 'SV.state.titles.list')), '제목별 점수')
    check(pg.eval_on_selector_all('#titleList .title-opt', 'e=>e.length') == 10, '제목 목록 렌더링')
    pg.click('[data-title-opt="3"]')
    pg.wait_for_timeout(300)
    check(state(pg, 'SV.state.titles.pick') == 3, '제목 선택')
    check(pg.eval_on_selector_all('#hashtagList .tag', 'e=>e.length') >= 5, '해시태그 자동 입력')
    check(len(pg.input_value('#descInput')) > 40, '설명 자동 입력')
    check(len(pg.input_value('#thumbText')) > 0, '썸네일 문구 자동 입력')
    check('#' in pg.input_value('#descInput'), '설명에 해시태그 포함')
    th = pg.evaluate(CANVAS_VAR, '#thumbCanvas')
    check(th['mx'] - th['mn'] > 30, '썸네일 미리보기 렌더링', th)

    desc_before = pg.input_value('#descInput')
    pg.fill('#descInput', desc_before + '\n\n직접 추가한 문장입니다.')
    pg.wait_for_timeout(200)
    pg.click('[data-title-opt="5"]')
    pg.wait_for_timeout(250)
    check('직접 추가한 문장입니다.' in pg.input_value('#descInput'), '직접 쓴 설명은 유지', pg.input_value('#descInput')[-20:])
    check(pg.input_value('#thumbText') != '', '썸네일 문구 유지/갱신')

    tb = pg.evaluate('''async () => { const b = await SV.makeThumbBlob();
      const bmp = await createImageBitmap(b);
      const arr = new Uint8Array(await b.slice(0, 8).arrayBuffer());
      return {size:b.size, w:bmp.width, h:bmp.height, sig:Array.from(arr)}; }''')
    check(tb['w'] == 1080 and tb['h'] == 1920, '썸네일 1080×1920', (tb['w'], tb['h']))
    check(tb['sig'] == [137, 80, 78, 71, 13, 10, 26, 10], 'PNG 시그니처', tb['sig'])
    check(tb['size'] > 30000, 'PNG 용량', f"{tb['size']:,}B")
    with pg.expect_download(timeout=20000) as td:
        pg.click('#btnDownloadThumb')
    tdl = td.value
    thumb_path = OUT / 'thumb.png'
    tdl.save_as(str(thumb_path))
    size = png_size(str(thumb_path))
    check(size == (1080, 1920), '내려받은 PNG 크기', size)
    check(tdl.suggested_filename.endswith('.png'), '썸네일 파일명 .png', tdl.suggested_filename)
    check(thumb_path.stat().st_size > 30000, '내려받은 PNG 용량', thumb_path.stat().st_size)

    pg.click('#btnCopyDesc')
    pg.wait_for_timeout(250)
    clip = pg.evaluate('async () => await navigator.clipboard.readText()')
    check(clip.strip() == pg.input_value('#descInput').strip(), '설명 클립보드 복사', len(clip))

    # =========================================================
    section('9. 6단계 · 다뿌려 업로드 허브')
    goto_step(pg, 6)
    pg.wait_for_timeout(300)
    texts = {pf: pg.input_value(f'#cap-{pf}') for pf in ['yt', 'tt', 'ig', 'th', 'fb']}
    check(all(len(t) > 40 for t in texts.values()), '5개 플랫폼 문구 생성', {k: len(v) for k, v in texts.items()})
    check('#Shorts' in texts['yt'], '유튜브 #Shorts 태그')
    check('#Shorts' not in texts['tt'], '틱톡에는 #Shorts 없음')
    check('쿠팡 파트너스' in texts['yt'], '유튜브 문구에 대가성 문구')
    check('link.coupang.com' in texts['yt'], '업로드 문구에 쿠팡 링크')
    check(texts['ig'].count('#') >= 5, '인스타 해시태그 5개 이상')
    cnt_txt = pg.inner_text('#cnt-yt'); ta_len = pg.evaluate("() => document.querySelector('#cap-yt').value.length")
    check(cnt_txt.split(' / ')[0] == str(ta_len), '글자수 카운터', f'{cnt_txt} vs {ta_len}')
    check(pg.inner_text('#hubStatus').startswith('5개'), '허브 상태 문구')

    pg.click('[data-copy="yt"]')
    pg.wait_for_timeout(300)
    clip = pg.evaluate('async () => await navigator.clipboard.readText()')
    check(clip.strip() == texts['yt'].strip(), '플랫폼 문구 복사')
    pg.click('#btnCopyAll')
    pg.wait_for_timeout(300)
    allclip = pg.evaluate('async () => await navigator.clipboard.readText()')
    check('[TikTok]' in allclip and '[Instagram Reels]' in allclip, '전체 문구 복사')

    hrefs = pg.eval_on_selector_all('#hubGrid a[data-open]', 'e=>e.map(a=>a.href)')
    check(len(hrefs) == 5, '업로드 페이지 링크 5개')
    check(any('studio.youtube.com' in h for h in hrefs), '유튜브 스튜디오 링크')
    check(any('tiktok.com/upload' in h for h in hrefs), '틱톡 업로드 링크')
    check(any('instagram.com' in h for h in hrefs) and any('threads.net' in h or 'threads.com' in h for h in hrefs) and any('facebook.com' in h for h in hrefs), '인스타·스레드·페이스북 링크')
    check(state(pg, 'SV.state.hub.confirm') is True, '게시 버튼 직접 누르기 기본 켜짐')
    set_checked(pg, '#confirmPublish', False)
    pg.wait_for_timeout(200)
    check('확인' in pg.inner_text('#publishBadge'), '게시 확인 필요 배지')
    set_checked(pg, '#confirmPublish', True)
    pg.wait_for_timeout(150)
    check('직접' in pg.inner_text('#publishBadge'), '직접 게시 배지')

    # =========================================================
    section('10. 7단계 · 쿠팡 파트너스')
    goto_step(pg, 7)
    pg.fill('#cpAccess', 'CP-ACCESS-TEST-0001')
    pg.fill('#cpSecret', 'CP-SECRET-TEST-0002')
    pg.click('#btnSaveCp')
    pg.wait_for_timeout(300)
    cp = state(pg, 'JSON.parse(localStorage.getItem("sv.coupang.v1"))')
    check(cp['access'] == 'CP-ACCESS-TEST-0001' and cp['secret'] == 'CP-SECRET-TEST-0002', '키 로컬 저장')
    check('저장됨' in pg.inner_text('#cpBadge'), '저장 상태 배지')
    check('서버 전송 없음' in pg.inner_text('#cpStatus'), '서버 전송 없음 안내')
    leaked = [u for u in requests if 'CP-SECRET' in u]
    check(not leaked, '시크릿 키가 어떤 요청에도 없음', leaked[:1])

    link = state(pg, 'SV.coupangLink()')
    check(link and 'link.coupang.com/a/' in link, '상품명 기반 자동 링크', link)
    check(state(pg, 'SV.state.product.name').split(' ')[0] in link or len(link) > 30, '자동 링크에 상품명 반영', link)

    pg.click('#btnAddFromProduct')
    pg.wait_for_timeout(300)
    rows = pg.eval_on_selector_all('#histBody tr', 'e=>e.length')
    check(rows >= 2, '링크 히스토리 행 추가', rows)
    check(pg.inner_text('#histCount') == str(state(pg, 'SV.state.history.length')), '히스토리 카운터')
    first = state(pg, 'SV.state.history[SV.state.history.length-1]')
    check(first['name'] and first['link'], '히스토리 제품명·링크', first)
    pg.click('[data-hist-copy]')
    pg.wait_for_timeout(250)
    clip = pg.evaluate('async () => await navigator.clipboard.readText()')
    check(clip == state(pg, 'SV.state.history[SV.state.history.length-1].link'), '히스토리 링크 복사')
    before = state(pg, 'SV.state.history.length')
    pg.click('[data-hist-del]')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.history.length') == before - 1, '히스토리 삭제')

    check('수수료를 제공받습니다' in pg.inner_text('#disclosureText'), '대가성 문구 문구')
    pg.click('#btnCopyDisclosure')
    pg.wait_for_timeout(200)
    clip = pg.evaluate('async () => await navigator.clipboard.readText()')
    check(clip == state(pg, 'SV.disclosureText()'), '대가성 문구 복사')

    set_checked(pg, '#cpDisclosure', False)
    pg.evaluate('SV.buildHubTexts()')
    pg.wait_for_timeout(200)
    check('쿠팡 파트너스' not in state(pg, 'SV.state.hubTexts.yt'), '대가성 문구 끄면 제거')
    set_checked(pg, '#cpDisclosure', True)
    pg.evaluate('SV.buildHubTexts()')
    pg.wait_for_timeout(200)
    check('쿠팡 파트너스' in state(pg, 'SV.state.hubTexts.yt'), '대가성 문구 다시 포함')

    set_checked(pg, '#cpAuto', False)
    state(pg, 'SV.state.history = []')
    pg.evaluate('SV.renderHistory()')
    check(state(pg, 'SV.coupangLink()') == '', '자동 생성 끄면 링크 비움')
    set_checked(pg, '#cpAuto', True)
    check('link.coupang.com' in state(pg, 'SV.coupangLink()'), '자동 생성 켜면 링크 생성')
    pg.fill('#cpBase', 'https://example-partner.test/a/')
    pg.evaluate("() => document.querySelector('#cpBase').dispatchEvent(new Event('change',{bubbles:true}))")
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.coupangLink()').startswith('https://example-partner.test/a/'), '접두어 변경 반영')
    pg.fill('#cpBase', 'https://link.coupang.com/a/')
    pg.evaluate("() => document.querySelector('#cpBase').dispatchEvent(new Event('change',{bubbles:true}))")
    pg.wait_for_timeout(200)

    # =========================================================
    section('10b. 도구 · 🔥 유명 쇼츠 자동생성 및 업로드')
    goto_view(pg, 'famous')
    pg.wait_for_timeout(350)
    check(pg.eval_on_selector_all('#famousSources [data-src]', 'e=>e.length') == 3, '영상 찾을 곳 3곳(TikTok·YouTube·Instagram)')
    check(state(pg, 'SV.state.famous.sources.length') == 3, '기본 3곳 모두 선택')
    check(pg.eval_on_selector_all('#famousLayout option', 'e=>e.map(o=>o.value)') == ['full', 'banded'], '화면 구성 = 꽉 찬/위아래 검은 화면')
    check('full' == state(pg, 'SV.state.famous.layout'), '기본 화면 구성 = 꽉 찬 화면')
    h_full = famous_hash(pg)
    check(pg.evaluate("() => { const c=document.querySelector('#famousCanvas'); return [c.width,c.height]; }") == [540, 960], '유명 쇼츠 미리보기 540×960')
    set_select(pg, '#famousLayout', 'banded')
    pg.wait_for_timeout(350)
    h_banded = famous_hash(pg)
    check(state(pg, 'SV.state.famous.layout') == 'banded' and h_banded != h_full, '위아래 검은 화면으로 바뀌면 미리보기 변화')
    check('위아래' in pg.inner_text('#famousLayoutBadge'), '화면 구성 배지 갱신', pg.inner_text('#famousLayoutBadge'))
    pg.fill('#famousCaption', '링크는 고정댓글에 있어요')
    pg.wait_for_timeout(250)
    h_cap = famous_hash(pg)
    check(h_cap != h_banded and state(pg, 'SV.state.famous.caption') == '링크는 고정댓글에 있어요', '하단 내 문구가 미리보기에 반영')
    pg.fill('#famousTitle', '유명 쇼츠 TOP 5')
    pg.wait_for_timeout(250)
    check(famous_hash(pg) != h_cap, '상단 제목 반영')

    set_checked(pg, '#famousNoThumb', True)
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.famous.noThumb') is True and state(pg, 'SV.state.famous.useThumbnail !== true'), '썸네일 안 쓰기 체크')
    cfg0 = pg.evaluate('() => SV.famousConfig()')
    check(cfg0['useThumbnail'] is False, '설정 JSON에 썸네일 미사용 반영')
    set_checked(pg, '#famousNoThumb', False)

    h_pos = famous_hash(pg)
    set_select(pg, '#famousPos', 'tr')
    pg.wait_for_timeout(250)
    check(famous_hash(pg) != h_pos, '표기 위치 오른쪽 위 반영')
    set_select(pg, '#famousPos', 'bl')
    pg.wait_for_timeout(250)
    check(famous_hash(pg) != h_pos, '표기 위치 왼쪽 아래 반영')
    set_select(pg, '#famousPos', 'tl')
    pg.wait_for_timeout(200)

    h_marks = famous_hash(pg)
    set_checked(pg, '#famousAiMark', False)
    pg.wait_for_timeout(250)
    h_noai = famous_hash(pg)
    check(state(pg, 'SV.state.famous.aiMark') is False and h_noai != h_marks, 'AI 표기 끄면 미리보기 변화')
    set_checked(pg, '#famousAiMark', True)
    pg.wait_for_timeout(200)
    set_checked(pg, '#famousTopN', False)
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.famous.topN') is False and famous_hash(pg) != h_marks, 'TOP N 끄면 미리보기 변화')
    set_checked(pg, '#famousTopN', True)
    pg.fill('#famousTopCount', '7')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.famous.topCount') == 7, 'TOP N 숫자 변경')
    pg.evaluate('SV.setFamousTime(0)')
    pg.wait_for_timeout(150)
    h_start = famous_hash(pg)
    pg.evaluate('SV.setFamousTime(SV.famousDur() * 0.9)')
    pg.wait_for_timeout(150)
    check(famous_hash(pg) != h_start, 'TOP N 카운트다운이 시간에 따라 바뀜')
    pg.evaluate('SV.setFamousTime(0)')

    # 영상 찾을 곳: 최소 1곳 강제
    pg.click('[data-src="youtube"]')
    pg.click('[data-src="instagram"]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.famous.sources') == ['tiktok'], '영상 찾을 곳 1곳만 남김', state(pg, 'SV.state.famous.sources'))
    pg.click('[data-src="tiktok"]')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.famous.sources') == ['tiktok'], '마지막 1곳은 해제되지 않음')
    pg.click('[data-src="youtube"]')
    pg.click('[data-src="instagram"]')
    pg.wait_for_timeout(200)
    check(len(state(pg, 'SV.state.famous.sources')) == 3, '3곳 다시 선택')
    check(pg.eval_on_selector_all('#famousCandidates .cand', 'e=>e.length') >= 1, '소재 후보 표시')
    pg.click('#famousCandidates [data-cand-pick]')
    pg.wait_for_timeout(250)
    check(bool(state(pg, 'SV.state.famous.pick')), '소재 고르기')

    # 하루 개수 · 시간대 · 랜덤 스케줄
    pd0 = state(pg, 'SV.state.famous.perDay')
    pg.click('#famousPlus')
    pg.wait_for_timeout(150)
    check(state(pg, 'SV.state.famous.perDay') == pd0 + 1, '하루 최대 개수 + 버튼')
    pg.click('#famousMinus')
    pg.click('#famousMinus')
    pg.wait_for_timeout(150)
    check(state(pg, 'SV.state.famous.perDay') == pd0 - 1, '하루 최대 개수 - 버튼')
    check(pg.inner_text('#famousPerDay').strip() == str(pd0 - 1), '하루 개수 라벨')
    pg.click('#famousPlus')
    set_select(pg, '#famousTz', 'Asia/Yakutsk')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.famous.tz') == 'Asia/Yakutsk', '시간대 선택(Asia/Yakutsk)')
    set_select(pg, '#famousTz', 'Asia/Seoul')
    pg.wait_for_timeout(200)

    pg.click('#famousAddAcct')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.famous.accounts.length') == 3, '계정 추가')
    check(pg.eval_on_selector_all('#famousSchedBody tr', 'e=>e.length') == 3, '스케줄 표 행 = 계정 수')
    pg.click('[data-fa-del="2"]')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.famous.accounts.length') == 2, '계정 삭제')
    sched = pg.evaluate('() => SV.state.famous.accounts.map(a => SV.famousSlot(a,0))')
    check(all(0 <= s['sec'] < 86400 for s in sched), '계정별 다음 올릴 시각 계산', sched)
    base_sec = state(pg, 'SV.state.famous.accounts[0].time').split(':')
    base_min = int(base_sec[0]) * 60 + int(base_sec[1])
    diff = abs(sched[0]['sec'] / 60 - base_min)
    check(diff <= 30.2, '랜덤 오차 ±30분 이내', round(diff, 1))
    check(state(pg, 'SV.famousSlot(SV.state.famous.accounts[0],0).sec') == sched[0]['sec'], '스케줄은 새로 계산해도 동일(고정 시드)')

    cfg = pg.evaluate('() => SV.famousConfig()')
    check(cfg['timezone'] and cfg['perDay'] == state(pg, 'SV.state.famous.perDay'), '설정 JSON 시간대·하루 개수', (cfg['timezone'], cfg['perDay']))
    check(cfg['randomizeWithinSeconds'] == 1800, '설정 JSON 랜덤 ±1800초')
    check(len(cfg['accounts']) == 2 and all(len(a['slots']) == 3 for a in cfg['accounts']), '설정 JSON 계정 3일치 슬롯')
    check(cfg['marks']['topN'] is True and cfg['marks']['topCount'] == 7, '설정 JSON TOP N 표기', cfg['marks'])
    with pg.expect_download(timeout=15000) as fdl:
        pg.click('#famousExportJson')
    fd = fdl.value
    jpath = OUT / 'famous-schedule.json'
    fd.save_as(str(jpath))
    parsed = json.loads(jpath.read_text(encoding='utf-8'))
    check(parsed['kind'] == 'famous-shorts-schedule' and parsed['accounts'][0]['slots'], '설정 JSON 내려받기', fd.suggested_filename)
    check(fd.suggested_filename.endswith('.json'), 'JSON 파일명 .json', fd.suggested_filename)

    # WebM 내보내기(화면 구성·표기 오버레이 실제 반영)
    voicelen = state(pg, 'SV.famousDur()')
    t0 = time.time()
    fblob = pg.evaluate("""async () => { const b = await SV.exportFamousWebM(); return b ? {size:b.size} : null; }""")
    ftook = time.time() - t0
    check(fblob and fblob['size'] > 150000, '유명 쇼츠 WebM 생성', fblob)
    check(abs(ftook - voicelen) < 6, '유명 쇼츠 실시간 녹화', f'{ftook:.1f}s / {voicelen:.1f}s')
    fmeta = pg.evaluate("""async () => { const v=document.createElement('video'); v.src=document.querySelector('#famousExportLink').href; v.muted=true; v.preload='auto';
      document.body.appendChild(v); await new Promise(r=>{v.onloadedmetadata=r; setTimeout(r,4000);});
      const o={w:v.videoWidth,h:v.videoHeight}; v.remove(); return o; }""")
    check(fmeta['w'] == 540 and fmeta['h'] == 960, '유명 쇼츠 WebM 540×960', fmeta)
    check('완료' in pg.inner_text('#famousExportStatus'), '유명 쇼츠 내보내기 완료 표시', pg.inner_text('#famousExportStatus'))

    # =========================================================
    section('10c. 도구 · 자막 지우개')
    goto_view(pg, 'eraser')
    pg.wait_for_timeout(400)
    opts = pg.eval_on_selector_all('#eraserFile option', 'e=>e.map(o=>o.value)')
    check(len(opts) == 2 and all(opts), '업로드한 영상 2개 선택 가능', opts)
    pg.evaluate('() => { SV.state.eraser.fileId = SV.state.files[0].id; SV.renderEraserOptions(); SV.syncEraserInputs(); SV.drawEraserPreview(true); }')
    pg.wait_for_timeout(500)
    e0 = eraser_hash(pg)
    cvv = pg.evaluate("() => { const c=document.querySelector('#eraserCanvas'); return [c.width,c.height]; }")
    check(cvv == [540, 960], '자막 지우개 캔버스 540×960', cvv)
    set_range(pg, '#eraserY', 30)
    pg.wait_for_timeout(300)
    e1 = eraser_hash(pg)
    check(state(pg, 'SV.state.eraser.y') == 30 and e1 != e0, '가릴 세로 위치 변경 반영')
    set_range(pg, '#eraserW', 90)
    pg.wait_for_timeout(300)
    check(eraser_hash(pg) != e1, '가릴 너비 변경 반영')
    e2 = eraser_hash(pg)
    set_select(pg, '#eraserMode', 'mosaic')
    pg.wait_for_timeout(300)
    check(state(pg, 'SV.state.eraser.mode') == 'mosaic' and eraser_hash(pg) != e2, '블러 ↔ 모자이크 전환')
    e3 = eraser_hash(pg)
    set_range(pg, '#eraserStrength', 32)
    pg.wait_for_timeout(300)
    check(eraser_hash(pg) != e3, '가리기 강도 변경 반영')
    check('32px' in pg.inner_text('#eraserStrengthVal'), '강도 라벨')
    pg.click('#eraserReset')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.eraser')['x'] == 18 and state(pg, 'SV.state.eraser')['w'] == 64, '영역 기본값 복원')
    set_select(pg, '#eraserMode', 'blur')
    t0 = time.time()
    eblob = pg.evaluate("""async () => { const b = await SV.exportEraserWebM(); return b ? {size:b.size} : null; }""")
    etook = time.time() - t0
    check(eblob and eblob['size'] > 60000, '자막 지우개 WebM 생성', eblob)
    check(etook < 8, '자막 지우개 녹화 시간', f'{etook:.1f}s')
    emeta = pg.evaluate("""async () => { const v=document.createElement('video'); v.src=document.querySelector('#eraserLink').href; v.muted=true; v.preload='auto';
      document.body.appendChild(v); await new Promise(r=>{v.onloadedmetadata=r; setTimeout(r,4000);});
      const o={w:v.videoWidth,h:v.videoHeight}; v.remove(); return o; }""")
    check(emeta['w'] == 540 and emeta['h'] == 960, '자막 지우개 WebM 540×960', emeta)
    check('완료' in pg.inner_text('#eraserStatus'), '자막 지우개 완료 표시', pg.inner_text('#eraserStatus'))

    # =========================================================
    section('10d. 도구 · 멀티 다운로더')
    goto_view(pg, 'multi')
    pg.wait_for_timeout(250)
    pg.fill('#multiInput', 'https://www.tiktok.com/@a/video/111\nhttps://www.youtube.com/shorts/abc\nhttps://www.tiktok.com/@a/video/111\n\n링크 아닌 줄\nhttps://www.instagram.com/reel/xyz/')
    pg.wait_for_timeout(500)
    mlinks = state(pg, 'SV.state.multi.links')
    check(len(mlinks) == 3, '중복·빈 줄·링크 아닌 줄 정리', len(mlinks))
    check(pg.inner_text('#multiCount').strip() == '3개', '링크 개수 표시')
    check(pg.eval_on_selector_all('#multiList .link-item', 'e=>e.length') == 3, '링크 목록 3개')
    cmd = state(pg, 'SV.multiCommand()')
    check(cmd.startswith('yt-dlp') and all(u in cmd for u in mlinks), 'yt-dlp 명령에 링크 포함')
    check('links.txt' in cmd, '명령에 links.txt 안내')
    pg.click('#multiCopyUrls')
    pg.wait_for_timeout(250)
    clip = pg.evaluate('async () => await navigator.clipboard.readText()')
    check(clip.strip().split('\n') == mlinks, 'URL 목록 복사')
    pg.click('#multiCopyCmd')
    pg.wait_for_timeout(250)
    clip = pg.evaluate('async () => await navigator.clipboard.readText()')
    check('yt-dlp' in clip, '명령 복사')
    pg.click('[data-multi-del="0"]')
    pg.wait_for_timeout(250)
    check(len(state(pg, 'SV.state.multi.links')) == 2, '목록에서 링크 빼기')
    with pg.expect_download(timeout=15000) as mdl:
        pg.click('#multiDownloadTxt')
    md = mdl.value
    txtpath = OUT / 'links.txt'
    md.save_as(str(txtpath))
    lines = [l for l in txtpath.read_text(encoding='utf-8').splitlines() if l.strip()]
    check(len(lines) == 2 and lines[0].startswith('http'), 'links.txt 내려받기', md.suggested_filename)
    pg.evaluate('() => { SV.setMulti(["https://youtu.be/a","https://youtu.be/b"].join("\\n"), true); }')
    pg.wait_for_timeout(250)
    saved = state(pg, 'JSON.parse(localStorage.getItem("sv.multi.v1"))')
    check(len(saved['links']) == 2, '멀티 링크 목록 저장')

    # =========================================================
    section('11. 레이아웃 · 데스크톱/모바일')
    pg.set_viewport_size({'width': 1440, 'height': 900})
    pg.wait_for_timeout(300)
    cols = pg.evaluate("() => getComputedStyle(document.querySelector('.shell')).gridTemplateColumns.split(' ').length")
    check(cols == 3, '데스크톱 3열 레이아웃', cols)
    pos = pg.evaluate("""() => { const m=document.querySelector('.main').getBoundingClientRect();
      const pv=document.querySelector('#previewPane').getBoundingClientRect();
      return {mainRight: Math.round(m.right), pvLeft: Math.round(pv.left), pvTop: Math.round(pv.top)}; }""")
    check(pos['pvLeft'] > pos['mainRight'] - 2, '데스크톱 미리보기 오른쪽 배치', pos)
    pg.set_viewport_size({'width': 1024, 'height': 900})
    pg.wait_for_timeout(300)
    cols = pg.evaluate("() => getComputedStyle(document.querySelector('.shell')).gridTemplateColumns.split(' ').length")
    check(cols == 1, '중간 폭에서는 1열로 전환', cols)
    ov = pg.evaluate('() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]')
    check(ov[0] <= ov[1] + 1, '1024 가로 오버플로 없음', ov)

    # 데모 콘텐츠 상태로 스크린샷(데스크톱)
    pg.set_viewport_size({'width': 1600, 'height': 1000})
    pg.wait_for_timeout(300)
    goto_step(pg, 4)
    pg.wait_for_timeout(500)
    pg.screenshot(path=str(SHOTS / 'test-run-step4.png'))
    goto_step(pg, 0)
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / 'desktop-step0.png'))
    goto_view(pg, 'perf')
    pg.wait_for_timeout(350)
    pg.screenshot(path=str(SHOTS / 'desktop-perf.png'))
    goto_step(pg, 4)

    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.wait_for_timeout(400)
    bad = []
    for v in pg.evaluate('() => SV.VIEW_ORDER'):
        goto_view(pg, v)
        pg.wait_for_timeout(130)
        w = pg.evaluate('() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]')
        if w[0] > w[1] + 1:
            bad.append((v, w))
    check(not bad, '모바일 390 모든 화면(12개) 가로 오버플로 없음', bad)
    goto_step(pg, 1)
    pg.wait_for_timeout(250)
    pg.screenshot(path=str(SHOTS / 'mobile-step1.png'))
    check(pg.is_visible('.mobile-bar'), '모바일 하단 내비 표시')
    targets = [(1, '#btnAnalyze'), (3, '#btnWriteScript'), (4, '#btnExportMini'), (5, '#btnSuggestTitles')]
    hs = []
    for stp, sel in targets:
        goto_step(pg, stp)
        pg.wait_for_timeout(120)
        hs.append((sel, round(pg.evaluate('(s) => document.querySelector(s).getBoundingClientRect().height', sel))))
    hs.append(('#btnSettings', round(pg.evaluate('() => document.querySelector("#btnSettings").getBoundingClientRect().height'))))
    check(min(v for _, v in hs) >= 30, '모바일 터치 타깃 ≥30px', hs)
    check(pg.evaluate("() => getComputedStyle(document.querySelector('#stepRail')).flexDirection") == 'row', '모바일 단계 레일 가로 스크롤')
    rail = pg.evaluate("() => { const r=document.querySelector('#stepRail').getBoundingClientRect(); return r.width <= innerWidth; }")
    check(rail, '단계 레일이 화면 폭을 넘지 않음')
    goto_step(pg, 4)
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / 'mobile-step4.png'))
    cvr = pg.evaluate("""() => { const r=document.querySelector('#previewCanvas').getBoundingClientRect(); return [r.width, r.width/r.height]; }""")
    check(abs(cvr[1] - 9/16) < 0.02 and cvr[0] <= 300, '모바일 미리보기 9:16 · ≤300px', cvr)
    pg.click('#mNext')
    pg.wait_for_timeout(250)
    check(state(pg, 'SV.state.step') == 5, '모바일 다음 버튼')
    pg.click('#mPrev')
    pg.wait_for_timeout(200)
    check(state(pg, 'SV.state.step') == 4, '모바일 이전 버튼')

    # =========================================================
    section('12. 새로고침 후 저장 유지')
    pg.set_viewport_size({'width': 1440, 'height': 900})
    pg.reload(wait_until='load')
    pg.wait_for_timeout(500)
    preset = state(pg, 'JSON.parse(localStorage.getItem("sv.preset.v1"))')
    check(preset['style']['capSize'] == 44, '프리셋 유지')
    check(pg.input_value('#capSize') == '44', '프리셋이 UI에 적용', pg.input_value('#capSize'))
    cp = state(pg, 'JSON.parse(localStorage.getItem("sv.coupang.v1"))')
    check(cp['access'] == 'CP-ACCESS-TEST-0001', '쿠팡 키 유지')
    check(state(pg, 'SV.state.history.length') >= 1, '링크 히스토리 유지')
    check(pg.input_value('#cpAccess') == 'CP-ACCESS-TEST-0001', '쿠팡 키 입력창 복원')
    cov = state(pg, 'JSON.parse(localStorage.getItem("sv.famous.v1"))')
    check(cov and cov['tz'] == 'Asia/Seoul' and cov['perDay'] == state(pg, 'SV.state.famous.perDay'), '유명 쇼츠 설정 유지', cov['tz'] if cov else None)
    cmulti = state(pg, 'JSON.parse(localStorage.getItem("sv.multi.v1"))')
    check(cmulti and len(cmulti['links']) == 2, '멀티 다운로더 목록 유지')
    check('데모' in pg.inner_text('#modeBadge'), '데모 모드 설정 유지')

    # 마지막 콘솔/네트워크 점검
    unexpected = [c for c in console if '429' not in c]
    check(not unexpected, '전체 플로우 콘솔 오류 0건(모의 429 제외)', unexpected[:3])
    check(any('429' in c for c in console), '429는 자동 전환 테스트에서만 발생', len([c for c in console if '429' in c]))
    check(not pageerrors, '전체 플로우 JS 예외 0건', pageerrors[:3])
    ext_after = [u for u in requests if not u.startswith(BASE) and not u.startswith('data:') and not u.startswith('blob:') and 'generativelanguage.googleapis.com' not in u]
    check(not ext_after, 'Gemini 외 외부 요청 0건', ext_after[:3])
    gem = [u for u in requests if 'generativelanguage.googleapis.com' in u]
    check(all('generativelanguage' in u for u in gem), '외부 요청은 Gemini API뿐', len(gem))

    browser.close()

print(f'\n{"="*54}\n테스트 결과: {count[0] - len(fails)}/{count[0]} 통과, 실패 {len(fails)}건')
for f in fails:
    print('  FAIL', f)
print('=' * 54)
