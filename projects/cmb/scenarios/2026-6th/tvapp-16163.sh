#!/bin/bash
# CTVR-16163 레TB: 우리동네클래스 탭에서 '○○ 님이 시청중인 클래스' 목록 제거
# 이전 코드는 시청 이력이 비면 목록을 숨겼으므로, 먼저 클래스 영상을 재생해 이력을 만든 뒤 확인한다. 대조군: VOD 탭.
source "$QA_KIT/lib/android.sh"; A_SERIAL=emulator-5554; A_PKG=com.cmbkr.rainbowtv.dev; A_ACT=com.cmbkr.rainbowtv.MainActivity; A_APP=flutter-tvapp; A_TICKET=CTVR-16163
rm -f $Q/results/$A_APP-$A_TICKET.json
a_launch 15
a_rec_start
a_tab "우리동네클래스"
adb shell input tap 380 960; sleep 5
a_check 01-play-class "시청 이력 만들기: 우리동네클래스 콘텐츠 상세" "우리동네클래스" ""
adb shell input tap 1374 508; sleep 25; a_key 4; sleep 3; a_key 4; sleep 4; a_close_popups >/dev/null
a_check 02-class-top "우리동네클래스 탭 상단(재생 직후)" "님께 추천하는 클래스" "님이 시청중인"
for i in 1 2 3; do a_key 20; sleep 1.5; a_key 20; sleep 2.5; a_check 0$((i+2))-class-down$i "우리동네클래스 탭 아래로 이동 $i" "" "님이 시청중인"; done
a_tab "VOD"
for i in 1 2 3 4 5; do a_texts 4000 | grep -q "님이 시청중인" && break; a_key 20; sleep 2; done
a_check 06-vod-contrast "대조군: VOD 탭 '○○ 님이 시청중인 VOD'(유지되어야 함)" "님이 시청중인" ""
a_rec_stop
