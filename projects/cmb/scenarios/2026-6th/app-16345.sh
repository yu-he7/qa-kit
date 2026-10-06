#!/bin/bash
# CTVR-16345 레모: 쇼핑 구매 링크에 platform=APP 추가 (직접판매: 안내 창 주소·바로이동 주소 / 중계판매: 외부 링크 그대로)
# 브라우저에 열린 실제 주소는 Chrome 원격 디버깅(/json)으로 읽어 결과에 남긴다.
source "$QA_KIT/lib/android.sh"; A_SERIAL=emulator-5554; A_PKG=com.cmb.rainbowtv; A_APP=flutter-app
# adb forward 는 adb 서버가 도는 쪽에 포트를 연다. Windows adb.exe 를 쓰면 Windows curl 로 읽는다
case "$QA_ADB" in *.exe) CURL=/mnt/c/Windows/System32/curl.exe ;; *) CURL=curl ;; esac
bounds_of() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml | python3 -c "
import sys,re,html
x=sys.stdin.read(); a,b=sys.argv[1],sys.argv[2]
for n in re.findall(r'<node [^>]*>',x):
  t=' '.join(html.unescape(v) for v in re.findall(r'(?:text|content-desc)=\"([^\"]*)\"',n))
  if a in t and b in t:
    q=list(map(int,re.findall(r'bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"',n)[0])); print((q[0]+q[2])//2,(q[1]+q[3])//2); break" "$1" "$2"; }
tab_url() { adb forward tcp:9333 localabstract:chrome_devtools_remote >/dev/null; $CURL -s http://127.0.0.1:9333/json | python3 -c "import sys,json; l=[t for t in json.load(sys.stdin) if t.get('type')=='page']; print(l[0]['url'] if l else '')"; }
note() { python3 - "$Q/results/$A_APP-$A_TICKET.json" "$1" "$2" <<'PY'
import sys,json; p,i,n=sys.argv[1:]; r=json.load(open(p))
for c in r['checks']:
    if c['id']==i: c['note']=n
json.dump(r,open(p,'w'),ensure_ascii=False,indent=2)
PY
}
open_onair_list() {
  adb shell input tap 672 136; sleep 3; a_tap_text "쇼핑"; sleep 5; a_close_popups >/dev/null
  for i in 1 2 3 4 5 6; do c=$(bounds_of "ON AIR" "모두보기"); [ -n "$c" ] && break; adb shell input swipe 540 1800 540 900 400; sleep 2; done
  adb shell input tap $c; sleep 5
}

# ---------- 1) 직접판매 ----------
A_TICKET=CTVR-16345; rm -f $Q/results/$A_APP-$A_TICKET.json
adb shell am force-stop com.android.chrome
a_launch 15
a_rec_start
open_onair_list
for i in $(seq 1 15); do c=$(bounds_of "생활공유 옥수수 수세미" "조회수"); [ -n "$c" ] && break; adb shell input swipe 540 1900 540 700 400; sleep 2; done
adb shell input swipe 540 1700 540 1100 400; sleep 2; c=$(bounds_of "생활공유 옥수수 수세미" "조회수"); echo "card at $c"; adb shell input tap $c; sleep 7
a_check 01-detail "직접판매 상품(14092 생활공유 옥수수 수세미) 상세 — 영상 재생 중이라 화면 문구 자동 대조 불가, 사진으로 확인" "" ""
adb shell input tap 540 1396; sleep 3  # 스토어 구매하기
a_check 02-dialog "구매 안내 창에 보이는 링크(복사되는 주소와 같음) — 사진으로 확인" "" ""
adb shell input tap 771 1485; sleep 7  # 바로이동
U=$(tab_url); echo "browser url: $U"
A_PKG_SAVE=$A_PKG; A_PKG=com.android.chrome
a_check 03-browser "바로이동으로 열린 브라우저(주소창은 도메인만 보임, 실제 주소는 결과 메모)" "" ""
A_PKG=$A_PKG_SAVE
note 03-browser "Chrome 원격 디버깅으로 읽은 실제 주소: $U / 모바일 웹 쇼핑 구매 라우트가 꺼져 있어 빈 화면이 정상"
python3 -c "
import json;p='$Q/results/$A_APP-$A_TICKET.json';r=json.load(open(p)); ok='/shopping/14092/purchase?platform=APP' in '$U'
[c.update(verdict='pass' if ok else 'fail', expect=[{'text':'열린 주소에 /shopping/14092/purchase?platform=APP','ok':ok}]) for c in r['checks'] if c['id']=='03-browser'];json.dump(r,open(p,'w'),ensure_ascii=False,indent=2)"
a_rec_stop

# ---------- 2) 중계판매 ----------
A_TICKET=CTVR-16345-relay; rm -f $Q/results/$A_APP-$A_TICKET.json
adb shell am force-stop com.android.chrome
a_launch 15
a_rec_start
open_onair_list
c=$(bounds_of "ON AIR 20" "조회수"); echo "relay card at $c"; adb shell input tap $c; sleep 7
a_check 01-detail "중계판매 상품(ON AIR 20) 상세 — 사진으로 확인" "" ""
adb shell input tap 540 975; sleep 7  # 네이버에서 구매
U=$(tab_url); echo "browser url: $U"
A_PKG=com.android.chrome
a_check 02-browser "중계판매 외부 링크로 열린 브라우저" "" ""
note 02-browser "Chrome 원격 디버깅으로 읽은 실제 주소: $U (platform 값이 없어야 함)"
python3 -c "
import json;p='$Q/results/$A_APP-$A_TICKET.json';r=json.load(open(p)); ok=('$U'!='' and 'platform=' not in '$U')
[c.update(verdict='pass' if ok else 'fail', expect=[{'text':'외부 링크에 platform 없음','ok':ok}]) for c in r['checks'] if c['id']=='02-browser'];json.dump(r,open(p,'w'),ensure_ascii=False,indent=2)"
a_rec_stop
