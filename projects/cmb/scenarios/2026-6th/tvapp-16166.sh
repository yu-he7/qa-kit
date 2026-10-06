#!/bin/bash
# CTVR-16166 레TB: 코인몰 → 코인보석함 명칭 변경 (쇼핑 > 코인보석함 → 경품 교환 다이얼로그 → 마이페이지 교환 내역 탭)
source "$QA_KIT/lib/android.sh"; A_SERIAL=$(a_serial tvapp); A_PKG=com.cmbkr.rainbowtv.dev; A_ACT=com.cmbkr.rainbowtv.MainActivity; A_APP=flutter-tvapp; A_TICKET=CTVR-16166
rm -f $Q/results/$A_APP-$A_TICKET.json
a_launch 15
a_rec_start
a_tab "우리동네클래스"; a_tab "쇼핑"
a_check 01-shopping-chips "쇼핑 탭 하단 구분" "쇼핑몰|떠리몰|코인보석함" "코인몰"
adb shell input tap 520 1065; sleep 4; a_key 20; sleep 3
a_check 02-coin-list "쇼핑 > 코인보석함 경품 목록" "코인보석함|골드 코인" "코인몰"
a_key 23; sleep 4
a_check 03-mall-dialog "경품 교환 다이얼로그 안내 문구" "※코인보석함 경품의 교환/환불/취소는" "코인몰"
a_key 4; sleep 2
a_tab "마이페이지"; a_key 20; sleep 1.5; a_key 22; sleep 1.5; a_key 22; sleep 1.5; a_key 23; sleep 5
a_check 04-mypage-history "마이페이지 > 코인보석함 경품 교환 내역 탭" "코인보석함 경품 교환 내역" "코인몰"
a_rec_stop
