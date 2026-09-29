#!/bin/bash
# CTVR-16162 레모: 우리동네 클래스(우클) 탭에서 '○○님이 시청 중인 ~' 구역 삭제 (대조군: VOD 탭은 유지)
source "$QA_KIT/lib/android.sh"; A_SERIAL=emulator-5554; A_PKG=com.cmb.rainbowtv; A_APP=flutter-app; A_TICKET=CTVR-16162
rm -f $Q/results/$A_APP-$A_TICKET.json
a_launch
a_rec_start
a_tab "VOD"; a_scroll_find "님이 시청 중인" 6
a_check 01-vod-contrast "대조군: VOD 탭 '시청 중인 VOD' 구역(유지되어야 함)" "님이 시청 중인" ""
adb shell input swipe 540 700 540 1900 300; sleep 1; adb shell input swipe 540 700 540 1900 300; sleep 1
a_tab "우클"
a_check 02-class-top "우리동네 클래스 탭 상단" "" "님이 시청 중인"
for i in 1 2 3 4; do adb shell input swipe 540 1800 540 700 400; sleep 3; a_check 0$((i+2))-class-scroll$i "우리동네 클래스 탭 스크롤 $i" "" "님이 시청 중인"; done
a_rec_stop
