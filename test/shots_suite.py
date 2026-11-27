"""쇼츠자판기 — 배포용 스크린샷 생성.

데모 데이터(업로드 영상 없이 자동 생성 장면)로 내 성과·1~6단계·도구 화면을 캡처한다.
  python3 test/shots_suite.py
"""
import os, shutil, threading, functools, http.server, socketserver, pathlib
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/workspace/.pw/browsers')
os.environ.setdefault('LD_LIBRARY_PATH', '/workspace/.pw/libs')
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path('/workspace/shorts-vending-webapp')
SHOTS = ROOT / 'test' / 'shots'
SHOTS.mkdir(parents=True, exist_ok=True)
PORT = 8850
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
httpd.RequestHandlerClass.log_message = lambda *a, **k: None
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}/'


def build_demo(pg):
    pg.evaluate('SV.fillSampleLinks()')
    pg.evaluate('SV.goStep(1)')
    pg.click('#btnAnalyze')
    pg.wait_for_function('() => SV.state.product && SV.state.refs.length', timeout=10000)
    pg.wait_for_timeout(300)
    pg.click('#refGrid [data-cart]')
    pg.evaluate('SV.goStep(3)')
    pg.click('#btnWriteScript')
    pg.wait_for_function('() => SV.state.script', timeout=8000)
    pg.wait_for_timeout(300)
    pg.click('#btnMakeVoice')
    pg.wait_for_function('() => SV.state.voice && SV.state.voice.timeline.length', timeout=15000)
    pg.wait_for_timeout(500)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1600, 'height': 1000}, locale='ko-KR', device_scale_factor=1)
    pg = ctx.new_page()
    pg.goto(BASE + 'index.html', wait_until='load')
    pg.wait_for_timeout(500)

    pg.evaluate('SV.goView("perf")')
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(SHOTS / '01-step0-desktop.png'))
    build_demo(pg)

    # step 1
    pg.evaluate('SV.goStep(1)')
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / '02-step1-desktop.png'))

    # step 2
    pg.evaluate('SV.goStep(2)')
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / '03-step2-desktop.png'))

    # step 3 — 후킹 칩 · 구글 목소리 · 문장 사이 간격
    pg.evaluate('SV.goStep(3)')
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / '04-step3-desktop.png'))
    pg.evaluate("() => { const el=document.querySelector('#gapSel'); el.value='0.3'; el.dispatchEvent(new Event('change',{bubbles:true})); }")
    pg.wait_for_timeout(300)
    pg.evaluate('window.scrollTo(0, 240)')
    pg.wait_for_timeout(200)
    pg.screenshot(path=str(SHOTS / '04b-step3-hooks.png'))
    pg.evaluate('window.scrollTo(0, 0)')

    # step 4 — 메인 배포 이미지
    pg.evaluate('SV.goStep(4)')
    pg.evaluate("() => { const s=document.querySelector('#capY'); s.value='74'; s.dispatchEvent(new Event('input',{bubbles:true})); }")
    pg.evaluate("() => { document.querySelector('#segAd button[data-v=\"coupang\"]').click(); }")
    pg.wait_for_timeout(300)
    pg.evaluate('SV.setTime(1.4)')
    pg.wait_for_timeout(600)
    pg.evaluate('window.scrollTo(0,0)')
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(SHOTS / '04c-step4-hero.png'))

    # step 4 — 자막 모션 15종 · 스마트 자막 위치 카드
    pg.evaluate("SV.setCapMotion('chip-wipe')")
    pg.evaluate("SV.setSmartPlace(true)")
    pg.evaluate('SV.setTime(1.4)')
    pg.wait_for_timeout(500)
    pg.evaluate("() => { const el=document.querySelector('#capMotionChips'); el.scrollIntoView({block:'center'}); }")
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / '04d-step4-motion.png'))
    pg.evaluate("SV.setSmartPlace(false)")
    pg.evaluate("SV.setCapMotion('outline-basic')")
    pg.evaluate("() => { document.querySelector('#segAd button[data-v=\"ad\"]').click(); }")
    pg.wait_for_timeout(200)

    # step 5
    pg.evaluate('SV.goStep(5)')
    pg.click('#btnSuggestTitles')
    pg.wait_for_function('() => SV.state.titles && SV.state.titles.list.length === 10', timeout=8000)
    pg.wait_for_timeout(300)
    pg.click('[data-title-opt="0"]')
    pg.wait_for_timeout(400)
    pg.evaluate('window.scrollTo(0,0)')
    pg.wait_for_timeout(200)
    pg.screenshot(path=str(SHOTS / '05-step5-desktop.png'))

    # step 6
    pg.evaluate('SV.goStep(6)')
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / '06-step6-desktop.png'))

    # 쿠팡파트너스
    pg.evaluate('SV.goStep(7)')
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / '07-step7-desktop.png'))

    # 도구 · 🔥 유명 쇼츠
    pg.evaluate('SV.goView("famous")')
    pg.evaluate("""() => { const el=document.querySelector('#famousLayout'); el.value='banded'; el.dispatchEvent(new Event('change',{bubbles:true}));
      const cap=document.querySelector('#famousCaption'); cap.value='링크는 고정댓글에 있어요'; cap.dispatchEvent(new Event('input',{bubbles:true})); }""")
    pg.wait_for_timeout(400)
    pg.evaluate('window.scrollTo(0,0)')
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(SHOTS / '08-famous-desktop.png'))
    shutil.copyfile(SHOTS / '08-famous-desktop.png', ROOT / 'preview-vending.png')

    # 도구 · 자막 지우개
    pg.evaluate('SV.goView("eraser")')
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / '09-eraser-desktop.png'))
    pg.evaluate('SV.goView("multi")')
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(SHOTS / '09b-multi-desktop.png'))

    # 도구 · 음성→텍스트 (STT)
    pg.evaluate('SV.goView("stt")')
    pg.wait_for_timeout(400)
    pg.set_input_files('#sttFileInput', str(ROOT / 'test' / 'media' / 'stt-speech.wav'))
    pg.wait_for_timeout(800)
    pg.click('[data-v="srt"]')
    pg.click('#btnSttSample')
    pg.wait_for_timeout(400)
    pg.evaluate('window.scrollTo(0,0)')
    pg.wait_for_timeout(200)
    pg.screenshot(path=str(SHOTS / '09c-stt-desktop.png'))

    # 도구 · 떡상 순위 & 6종 벤치마킹
    pg.evaluate('SV.goView("trend")')
    pg.wait_for_timeout(300)
    pg.click('#btnTrendSample')
    pg.wait_for_timeout(500)
    pg.evaluate('() => SV.trendPick(SV.state.trend.videos[0].id)')
    pg.click('#btnBenchRun')
    pg.wait_for_timeout(800)
    pg.evaluate('window.scrollTo(0,0)')
    pg.wait_for_timeout(200)
    pg.screenshot(path=str(SHOTS / '09d-trend-desktop.png'))
    shutil.copyfile(SHOTS / '09d-trend-desktop.png', ROOT / 'preview-trend.png')
    pg.evaluate('SV.goView("stt")')
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(SHOTS / '09e-stt-full.png'), full_page=True)

    # 모바일
    mp = ctx.new_page()
    mp.set_viewport_size({'width': 390, 'height': 844})
    mp.goto(BASE + 'index.html', wait_until='load')
    mp.wait_for_timeout(400)
    build_demo(mp)
    mp.evaluate('SV.goStep(4)')
    mp.evaluate('SV.setTime(1.4)')
    mp.wait_for_timeout(500)
    mp.evaluate('window.scrollTo(0,0)')
    mp.screenshot(path=str(SHOTS / '10-mobile-step4.png'))
    mp.evaluate("SV.setCapMotion('pop-bounce')")
    mp.evaluate("() => { const el=document.querySelector('#capMotionChips'); el.scrollIntoView({block:'center'}); }")
    mp.wait_for_timeout(400)
    mp.screenshot(path=str(SHOTS / '10b-mobile-motion.png'))
    mp.evaluate("SV.setCapMotion('outline-basic')")
    mp.evaluate('SV.goStep(3)')
    mp.wait_for_timeout(300)
    mp.screenshot(path=str(SHOTS / '11-mobile-step3.png'))
    mp.evaluate('SV.goView("perf")')
    mp.wait_for_timeout(300)
    mp.screenshot(path=str(SHOTS / '13-mobile-perf.png'))
    mp.evaluate('SV.goView("famous")')
    mp.wait_for_timeout(300)
    mp.screenshot(path=str(SHOTS / '14-mobile-famous.png'))
    shutil.copyfile(SHOTS / '14-mobile-famous.png', ROOT / 'preview-vending-mobile.png')
    mp.evaluate('SV.goView("trend")')
    mp.wait_for_timeout(300)
    mp.evaluate('window.scrollTo(0,0)')
    mp.screenshot(path=str(SHOTS / '15-mobile-trend.png'))
    mp.evaluate('SV.goView("stt")')
    mp.wait_for_timeout(300)
    mp.evaluate('window.scrollTo(0,0)')
    mp.screenshot(path=str(SHOTS / '16-mobile-stt.png'))
    mp.evaluate('SV.goStep(1)')
    mp.wait_for_timeout(300)
    mp.screenshot(path=str(SHOTS / '12-mobile-step1.png'))

    # 한글 렌더링/넘침 계측
    issues = pg.evaluate("""() => {
      const out = [];
      document.querySelectorAll('h1,h2,h3,.panel-head p,.card-head h3,.badge,.btn').forEach(el => {
        if (el.offsetParent === null) return;
        const cs = getComputedStyle(el);
        if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible') out.push([el.tagName, el.className, el.textContent.trim().slice(0, 30)]);
      });
      return out;
    }""")
    print('clip issues:', issues)
    print('mobile overflow:', mp.evaluate('() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]'))
    print('shots written:', sorted(x.name for x in SHOTS.glob('*.png')))
    b.close()
