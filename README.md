# qa-kit

여러 앱을 한 검수 회차로 묶어 **화면 촬영 → 문구 자동 대조 → 영상 → 보고서**까지 만드는 도구다.
웹, 모바일웹, TV 웹앱, 관리자(CMS·CRM), 안드로이드 폰·TV 앱을 같은 결과 형식으로 모은다.

- 판정은 "화면에 기대 문구가 있고, 없어야 할 문구는 없다"는 자동 대조다. 최종 판정은 사람이 사진·영상으로 한다.
- 화면으로 확인할 수 없는 항목은 `info`(참고)로 사유를 남긴다. 보고서 맨 위 **직접 확인할 것**에 자동으로 모인다.
- 검수 대상이 아닌 서버(운영 등)로 나가는 요청은 막고, 요청한 서버 목록을 결과에 남긴다.

## 구조

```
bin/qa                 명령(new·wt·build·patch·serve·run·note·report·status·clean)
lib/config.js          실행 폴더(QA_RUN)·프로젝트 설정·계정 파일 읽기
lib/web.js             Playwright 엔진: session() → check()/shot()/info() → close()
lib/android.sh         adb 엔진: a_launch·a_tab·a_tap_text·a_check·a_rec_start/stop …
lib/report.js          results/*.json + checklist.json → report/index.html
lib/note.py            사람이 확인한 판정·사유 기록
templates/checklist.json
projects/<name>/
  project.json         저장소·앱 종류·포트·설치 명령·QA 전용 로컬 패치·차단 서버·기기 패키지
  lib/                 프로젝트별 로그인 등
  checklists/<회차>.json
  scenarios/<회차>/    티켓별 시나리오(.js 웹, .sh 안드로이드)
```

실행 결과는 저장소 밖 **실행 폴더**(기본 `~/qa-runs/<project>-<round>/`)에 쌓인다.

```
run.json checklist.json
wt/<repo>/            기준 브랜치의 분리 워크트리(검수 전용, 커밋하지 않음)
shots/ videos/ results/ report/index.html logs/
state/                로그인 세션(토큰 포함, 권한 700). 공유·커밋 금지
```

## 사용 순서

```bash
npm install && npx playwright install chromium     # 처음 한 번
bin/qa new cmb 2026-7th "7차 검수 결과"               # 실행 폴더 생성, 회차 체크리스트가 있으면 복사
export QA_RUN=~/qa-runs/cmb-2026-7th
# checklist.json 을 티켓에 맞게 채운다(templates/checklist.json 참고)
bin/qa wt web webmobile ctv cms crm app tvapp        # 워크트리 + 의존성 설치
bin/qa patch ctv                                     # project.json 의 devPatches(검수 전용) 적용
bin/qa serve web webmobile ctv cms crm               # 개발 서버(project.json 의 port)
bin/qa build app && bin/qa build tvapp               # 안드로이드 APK(.fvmrc 의 Flutter 버전 사용)
bin/qa run projects/cmb/scenarios/2026-7th/*.js projects/cmb/scenarios/2026-7th/*.sh
bin/qa note webmobile CTVR-1 03-modal info "진입 경로 없음 — 코드로 확인"   # 필요한 경우
bin/qa report                                        # $QA_RUN/report/index.html
bin/qa stop; bin/qa unpatch ctv; bin/qa clean
```

## 시나리오 작성

웹(`.js`):

```js
const { session, saveLogin, statePath } = require('../../../../lib/web');
const s = await session({ app: 'vue-web', ticket: 'CTVR-1', title: '…', base, storage: statePath('web') });
await s.page.goto(base + '/mypage');
await s.check('01-mypage', { screen: '마이페이지', expect: ['새 문구'], absent: ['옛 문구'] });
s.info('02-modal', { screen: '구매 모달', note: '진입 경로 없음 — 코드 diff로 확인' });
await s.close();
```

- `check`의 `extra: [{ text, ok }]`로 문구 외 판정(입력 길이 등)을 더한다.
- 로그인은 `saveLogin`으로 한 번 만들고 `storage`로 재사용한다. 인증 문자처럼 부작용이 있는 로그인은 `maxAgeMin`으로 재사용 기간을 둔다.
- 대조군(바뀌지 않아야 하는 화면)을 함께 찍는다. "없음" 판정이 우연히 비어 있어서가 아님을 보여 준다.

안드로이드(`.sh`): `source "$QA_KIT/lib/android.sh"`, `A_SERIAL/A_PKG/A_APP/A_TICKET`을 정한 뒤 `a_launch → a_rec_start → a_check … → a_rec_stop`.

## 지켜야 할 것

- 검수는 dev 등 검수 서버에서만 한다. `blockHosts`로 운영 요청을 막고, 결과의 요청 서버 목록을 확인한다.
- 조회·입력·모달 열기까지만 한다. 저장·삭제·정지 같은 데이터 변경 버튼은 누르지 않는다.
- QA 전용 패치(`devPatches`)는 워크트리에서만 적용하고 커밋하지 않는다. 끝나면 `unpatch`로 되돌린다.
- 계정은 `project.json`의 `accountsEnv`가 가리키는 저장소 밖 파일(권한 600)에만 둔다. 이 저장소·실행 결과·로그에 값을 쓰지 않는다.
- 스크린샷·영상에는 테스트 계정 정보가 찍힐 수 있다. 실행 폴더를 외부에 공유할 때 확인한다.

## 새 프로젝트 추가

`projects/<name>/project.json`을 만든다(`projects/cmb/project.json` 참고). 필수 항목은 `accountsEnv`·`blockHosts`·`reposRoot`·`apps`다.
각 앱에는 `repo`·`kind`와, 웹이면 `port`·`serve`(필요하면 `install`·`devPatches`), 안드로이드면 `package`·`serial`·`flavor`·`dartDefine`을 둔다.
