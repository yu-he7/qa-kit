#!/bin/bash
# CTVR-16346 레TB: 직접판매 상품 상세 → 구매하기 → 구매 링크 전달 창까지 촬영.
# TV 에뮬레이터에서 번호 입력이 입력칸에 들어가지 않아 전송 단계는 촬영하지 못함. 링크 값은 임시 단위 테스트로 따로 확인했다.
source "$QA_KIT/lib/android.sh"; A_SERIAL=$(a_serial tvapp); A_PKG=com.cmbkr.rainbowtv.dev; A_ACT=com.cmbkr.rainbowtv.MainActivity; A_APP=flutter-tvapp; A_TICKET=CTVR-16346
rm -f $Q/results/$A_APP-$A_TICKET.json
a_launch 20
a_rec_start
a_tab "우리동네클래스"; a_tab "쇼핑"
for i in $(seq 1 25); do if a_texts 3000 | grep -q "옥수수"; then adb shell input tap 199 479; break; fi; sleep 1; done
sleep 9
a_check 01-detail "직접판매 상품(14092 생활공유 옥수수 수세미) 상세" "생활공유 옥수수 수세미|구매하기" ""
a_key 19; sleep 1; a_key 23; sleep 3
a_check 02-dialog "구매하기 → 구매 링크 전달 창(문자 전송 전 단계)" "구매 링크 전달" ""
sleep 2; a_key 4; sleep 2
a_rec_stop
