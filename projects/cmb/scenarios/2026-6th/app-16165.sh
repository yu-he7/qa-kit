#!/bin/bash
# CTVR-16165 레모: 코인몰 → 코인보석함 명칭 변경 (쇼핑 탭 → 경품 교환 → 마이 → 교환 내역)
source "$QA_KIT/lib/android.sh"; A_SERIAL=$(a_serial app); A_PKG=com.cmb.rainbowtv; A_APP=flutter-app; A_TICKET=CTVR-16165
rm -f $Q/results/$A_APP-$A_TICKET.json
a_launch
a_rec_start
adb shell input tap 672 136; sleep 4; a_tap_text "쇼핑"; sleep 4; adb shell input swipe 540 1700 540 900 400; sleep 2
a_check 01-shopping-tab "홈 > 쇼핑 > 하단 탭" "쇼핑몰|떠리몰|코인보석함" "코인몰"
a_tap_text "코인보석함"; sleep 4
a_check 02-coin-tab "쇼핑 > 코인보석함 탭(경품 목록)" "코인보석함|골드 코인" "코인몰"
a_tap_text "CMB_경품"; sleep 4; adb shell input swipe 540 1800 540 600 400; sleep 2
a_check 03-prize-notice "경품 교환하기 화면 하단 안내" "※코인보석함 경품의 교환/환불/취소는" "코인몰"
a_tap_text "취소" >/dev/null; sleep 2; a_key 4; sleep 2
a_tap_text "마이"; sleep 4; adb shell input swipe 540 1700 540 700 400; sleep 2
a_check 04-mypage-menu "마이페이지 메뉴" "코인보석함 교환 내역" "코인몰"
a_tap_text "코인보석함 교환 내역"; sleep 4
a_check 05-prize-history "코인보석함 교환 내역 화면" "코인보석함 교환 내역" "코인몰"
a_rec_stop
