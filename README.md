# qa-kit

여러 앱을 한 검수 회차로 묶어 **화면 촬영 → 문구 자동 대조 → 영상 → 보고서**까지 만드는 도구다.
웹, 모바일웹, TV 웹앱, 관리자(CMS·CRM), 안드로이드 폰·TV 앱을 같은 결과 형식으로 모은다.

- 판정은 "화면에 기대 문구가 있고, 없어야 할 문구는 없다"는 자동 대조다. 최종 판정은 사람이 사진·영상으로 한다.
- 화면으로 확인할 수 없는 항목은 `info`(참고)로 사유(`reason`)를 남긴다. 보고서 맨 위 **직접 확인할 것**에 사유별로 모인다.
- 검수 대상이 아닌 서버(운영 등)로 나가는 요청은 막고, 요청한 서버 목록을 결과에 남긴다.

## 구조

```
bin/qa                 명령(new·wt·build·patch·serve·run·note·report·tc-results·status·clean)
lib/config.js          실행 폴더(QA_RUN)·프로젝트 설정·계정 파일 읽기
lib/web.js             Playwright 엔진: session() → check()/shot()/info() → close()
lib/android.sh         adb 엔진: a_launch·a_tab·a_tap_text·a_check·a_shot·a_info·a_rec_start/stop …
lib/results.js         checklist·결과 읽기, 티켓 판정, TC 연결(report·tc-results 공용)
lib/report.js          results/*.json + checklist.json → report/index.html
lib/tc-results.js      results/*.json → TC 단계별 결과 JSON
lib/note.py            사람이 확인한 판정·사유 기록
templates/checklist.json
projects/<name>/
  project.json         저장소·앱 종류·포트·설치 명령·QA 전용 로컬 패치·차단 서버·기기 패키지
  project.local.json   개인 환경 값(adb·SDK 경로·기기 이름 등)만 덮어쓴다. 커밋하지 않는다
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
bin/qa new cmb 2026-7th "7차 검수 결과" --checklist <파일>   # 실행 폴더 생성. checklist: 파일 > 회차 체크리스트 > 템플릿
export QA_RUN=~/qa-runs/cmb-2026-7th
# 템플릿(PROJ-0000)이 복사되면 경고가 뜬다. 채우지 않으면 모든 결과가 "체크리스트 밖"으로 붙는다
bin/qa wt web webmobile ctv cms crm app tvapp        # 워크트리 + 의존성 설치
bin/qa patch ctv                                     # project.json 의 devPatches(검수 전용) 적용
bin/qa serve web webmobile ctv cms crm               # 개발 서버(project.json 의 port)
bin/qa build app && bin/qa build tvapp               # 안드로이드 APK(.fvmrc 의 Flutter 버전 사용)
bin/qa run projects/cmb/scenarios/2026-7th/*.js projects/cmb/scenarios/2026-7th/*.sh
bin/qa run projects/cmb/scenarios/2026-6th/cms-16281-16282.js -- content   # -- 뒤는 시나리오 인자
bin/qa note webmobile CTVR-1 03-modal info "진입 경로 없음 — 코드로 확인" --reason human-judge   # 필요한 경우
bin/qa report                                        # $QA_RUN/report/index.html (checklist 가 템플릿이면 맨 위 경고)
bin/qa tc-results --out $QA_RUN/report/tc-results.json   # TC 단계별 결과(아래 "사람 TC와 잇기")
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

- `check`의 `extra: [{ text, ok }]`로 문구 외 판정(입력 길이 등)을 더한다. `expect`·`absent`는 문자열 하나도 받는다.
- 사람 TC와 이으려면 `session({..., tc: { id: 'TC-E2E-0405', journey: 'J04', source: '<초안>.json' }})`을 준다. 결과 JSON 최상위에 `tc`로 남는다.
- `info`·`fail`에는 `reason`을 둔다: `human-judge`(사람 판정) · `blocked-write`(저장·삭제라 실행 안 함) · `wait-time`(시각 대기) · `env`(환경 문제) · `record`(기록용 촬영). `check(id, {..., reason})`, `info(id, { screen, note, reason })`. 기본값: 판정 항목 없는 `check`는 `human-judge`, `shot`은 `record`.
- 로그인은 `saveLogin`으로 한 번 만들고 `storage`로 재사용한다. 인증 문자처럼 부작용이 있는 로그인은 `maxAgeMin`으로 재사용 기간을 둔다.
- 대조군(바뀌지 않아야 하는 화면)을 함께 찍는다. "없음" 판정이 우연히 비어 있어서가 아님을 보여 준다.
- **TV 앱(`kind: web-tv`, 레TB)은 [docs/TV-FOCUS.md](docs/TV-FOCUS.md)를 먼저 읽는다.** 포커스 사고는 화면 문구가 멀쩡해서 `expect`·`absent`로 잡히지 않는다. 포커스 판정은 `extra`로 넣고 화면별 최소 점검 11가지를 돈다.

안드로이드(`.sh`): `source "$QA_KIT/lib/android.sh"`, `A_SERIAL=$(a_serial <앱키>)`와 `A_PKG/A_APP/A_TICKET`을 정한 뒤 `a_launch → a_rec_start → a_check … → a_rec_stop`.
TC 연결은 `A_TC`·`A_TC_JOURNEY`·`A_TC_SOURCE`, 사유는 `a_check <id> "<화면>" "<기대>" "<없어야>" [reason]` · `a_shot <id> "<화면>" [메모] [reason]` · `a_info <id> "<화면>" "<메모>" [reason]`.

## 판정

티켓(= TC) 1차 판정: check 하나라도 `fail` → **실패** / 모두 `pass` → **통과** / `pass`와 `info`가 섞임 → **부분**(직접 확인 남음) / 모두 `info` → **참고** / 결과 없음(또는 check 없음) → **미실행**.
"직접 확인할 것"은 실패 → 사유별 참고 → 미실행 순서로 묶는다. `reason`이 없는 옛 결과는 "사유 미분류"로 모인다. checklist의 `kit: "B"` 단계는 `reason`이 없어도 "사람 판정"으로 본다.

## 사람 TC와 잇기

사람용 여정형 TC(초안 JSON)가 원본이다. 공통 명세: `~/qa-runs/.journey-spec.md` 3·4절.

1. test-scenario-draft `kit` 명령으로 초안 JSON에서 checklist를 만든다: `scenario_xlsx.py kit <초안.json> --out checklist.json`. 항목 하나 = (케이스, 앱), `ticket` = 케이스 ID, check `id` = `s<n>`.
2. `bin/qa new <project> <round> --checklist checklist.json`으로 실행 폴더를 만든다.
3. 시나리오는 `ticket`을 케이스 ID로, check `id`를 `s<n>`으로 쓰고 `tc`를 넘긴다. 보고서는 checklist의 `expect`(문자열·배열)·`absent`·`kit`(B는 "사람 판정")·`handoff`("앞서 사람이 할 일")를 함께 보여 준다.
4. `bin/qa tc-results --out <파일>`로 `[{tc, step, app, verdict, reason, note, shot}]`을 낸다. 결과에 `tc`가 없으면 checklist의 `tc`를 쓰고(`tc_source: "checklist"`), 그것도 없으면 `ticket`을 쓴다(`tc_source: "ticket"`).
5. cmb-itest-plan `collect_results.py --kit`이 이 파일을 사람 시트의 "자동화 제안" 열로만 옮긴다. 판정은 사람이 정한다.

## 지켜야 할 것

- 검수는 dev 등 검수 서버에서만 한다. `blockHosts`로 운영 요청을 막고, 결과의 요청 서버 목록을 확인한다.
- 조회·입력·모달 열기까지만 한다. 저장·삭제·정지 같은 데이터 변경 버튼은 누르지 않는다.
- QA 전용 패치(`devPatches`)는 워크트리에서만 적용하고 커밋하지 않는다. 끝나면 `unpatch`로 되돌린다.
- 계정은 `project.json`의 `accountsEnv`가 가리키는 저장소 밖 파일(권한 600)에만 둔다. 이 저장소·실행 결과·로그에 값을 쓰지 않는다.
- 스크린샷·영상에는 테스트 계정 정보가 찍힐 수 있다. 실행 폴더를 외부에 공유할 때 확인한다.

## 새 프로젝트 추가

`projects/<name>/project.json`을 만든다(`projects/cmb/project.json` 참고). 필수 항목은 `accountsEnv`·`blockHosts`·`reposRoot`·`apps`다.
PC마다 다른 값은 `project.local.json`에 둔다([설치 가이드](docs/SETUP.md#4-내-pc에-맞게-고칠-설정)).
각 앱에는 `repo`·`kind`와, 웹이면 `port`·`serve`(필요하면 `install`·`devPatches`), 안드로이드면 `package`·`serial`·`flavor`·`dartDefine`을 둔다.
