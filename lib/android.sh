#!/bin/bash
# 안드로이드(폰·TV) 촬영 엔진. usage: source lib/android.sh; A_SERIAL=emulator-5554 A_PKG=<패키지> A_APP=<앱키> A_TICKET=<티켓>
# QA_RUN: 실행 폴더(필수). QA_ADB: adb 실행 파일(없으면 PATH 의 adb). WSL 에서 Windows 에뮬레이터를 쓰면 adb.exe 경로를 준다.
[ -n "$QA_RUN" ] || { echo "QA_RUN 이 없습니다" >&2; return 1 2>/dev/null || exit 1; }
Q=$QA_RUN
QA_ADB=${QA_ADB:-$(command -v adb)}
adb() { "$QA_ADB" ${A_SERIAL:+-s $A_SERIAL} "$@"; }
A_TMP=$Q/.tmp; mkdir -p "$A_TMP"

a_dirs() { mkdir -p "$Q/shots/$A_APP" "$Q/videos/$A_APP" "$Q/results"; }

# 화면 녹화 시작/종료 (screenrecord는 한 번에 최대 180초라 이어 붙이지 않고 시나리오를 짧게 유지한다)
a_rec_start() { a_dirs; adb shell rm -f /sdcard/qa.mp4; (adb shell screenrecord --bit-rate 6000000 --time-limit 180 /sdcard/qa.mp4 >/dev/null 2>&1 &); sleep 1; }
a_rec_stop() { adb shell pkill -INT screenrecord; sleep 3; adb exec-out cat /sdcard/qa.mp4 > "$Q/videos/$A_APP/$A_TICKET.mp4"; ls -la "$Q/videos/$A_APP/$A_TICKET.mp4"; }

# 스크린샷 + UI 덤프 문구 대조. usage: a_check <nn-id> "<화면 설명>" "기대1|기대2" "없어야1|없어야2"
a_check() {
  a_dirs; local id=$1 screen=$2 expect=$3 absent=$4 f="$A_TICKET-$1.png"
  sleep 1.5
  adb exec-out screencap -p > "$Q/shots/$A_APP/$f"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml > $A_TMP/ui.xml
  python3 - "$Q" "$A_APP" "$A_TICKET" "$id" "$screen" "$expect" "$absent" "$f" "$A_PKG" <<'EOF'
import sys, json, os, re, html
Q, app, ticket, id_, screen, expect, absent, f, pkg = sys.argv[1:]
xml = open(os.path.join(Q, '.tmp', 'ui.xml'), encoding='utf-8', errors='ignore').read()
texts = ' '.join(html.unescape(t) for t in re.findall(r'(?:text|content-desc)="([^"]*)"', xml))
exp = [{'text': t, 'ok': t in texts} for t in expect.split('|') if t]
abs_ = [{'text': t, 'ok': t not in texts} for t in absent.split('|') if t]
verdict = 'pass' if all(x['ok'] for x in exp + abs_) else 'fail'
if not exp and not abs_: verdict = 'info'
note = ''
if pkg and f'package="{pkg}"' not in xml: verdict, note = 'fail', f'앱({pkg}) 화면이 아님 — 시나리오 이동 실패'
p = os.path.join(Q, 'results', f'{app}-{ticket}.json')
r = json.load(open(p)) if os.path.exists(p) else {'app': app, 'ticket': ticket, 'checks': [], 'errors': []}
r['checks'] = [c for c in r['checks'] if c['id'] != id_]
r['checks'].append({'id': id_, 'screen': screen, 'shot': f'shots/{app}/{f}', 'expect': exp, 'absent': abs_, 'verdict': verdict, 'note': note})
r['checks'].sort(key=lambda c: c['id'])
v = f'videos/{app}/{ticket}.mp4'
if os.path.exists(os.path.join(Q, v)): r['video'] = v
json.dump(r, open(p, 'w'), ensure_ascii=False, indent=2)
print(verdict.upper(), ticket, id_, ' | '.join(x['text'] for x in exp + abs_ if not x['ok']), note)
EOF
}

# 화면 문구 목록(탐색용)
a_texts() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml | grep -oE '(text|content-desc)="[^"]+"' | sed -E 's/^[a-z-]+="//; s/"$//' | tr '\n' ' ' | cut -c1-${1:-1500}; echo; }
# 문구가 있는 요소 가운데를 누른다
a_tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  local b; b=$(adb exec-out cat /sdcard/ui.xml | python3 -c "
import sys,re,html
x=sys.stdin.read(); t=sys.argv[1]
for m in re.finditer(r'<node [^>]*>', x):
    n=m.group(0); s=' '.join(html.unescape(v) for v in re.findall(r'(?:text|content-desc)=\"([^\"]*)\"', n))
    if t in s:
        a=list(map(int,re.findall(r'bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"',n)[0])); print((a[0]+a[2])//2,(a[1]+a[3])//2); break
" "$1")
  [ -n "$b" ] && adb shell input tap $b && echo "tap '$1' at $b" || echo "not found: $1"
}
a_key() { adb shell input keyevent "$@"; }
# 홈 팝업을 "하루 동안 보지 않기"로 모두 닫는다
a_close_popups() { for i in 1 2 3 4 5; do t=$(a_texts 400); echo "$t" | grep -qE "보지 않기|그만보기" || break; if echo "$t" | grep -q "하루 동안 보지 않기"; then a_tap_text "하루 동안 보지 않기" >/dev/null; else a_tap_text "오늘 하루 그만보기" >/dev/null; fi; sleep 2; done; }
# 앱을 새로 띄워 홈에서 시작한다(팝업 닫기 포함)
a_launch() { adb shell am force-stop $A_PKG; sleep 1; adb shell am start -W --display 0 -n $A_PKG/${A_ACT:-.MainActivity} >/dev/null; sleep ${1:-10}; a_close_popups >/dev/null; }
# 탭을 누르고 그 탭의 팝업까지 닫는다
a_tab() { a_tap_text "$1"; sleep 4; a_close_popups >/dev/null; sleep 1; }
# 문구가 보일 때까지 최대 N번 스크롤한다(찾으면 0)
a_scroll_find() { for i in $(seq 1 ${2:-6}); do a_texts 4000 | grep -q "$1" && return 0; adb shell input swipe 540 1700 540 900 400; sleep 2; done; a_texts 4000 | grep -q "$1"; }
# 포커스된 요소의 문구(TV 방향키 이동 확인용)
a_focus() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml | python3 -c "
import sys,re,html
x=sys.stdin.read()
for m in re.finditer(r'<node [^>]*focused=\"true\"[^>]*>', x):
    n=m.group(0); print('focus:', ' '.join(html.unescape(v) for v in re.findall(r'(?:text|content-desc)=\"([^\"]*)\"', n))[:80], re.findall(r'bounds=\"([^\"]*)\"',n))
"; }
