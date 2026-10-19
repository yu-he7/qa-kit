# TV 앱 검수 — 포커스 점검 기준

리모컨으로만 쓰는 화면(레CTV `kind: web-tv`, 레TB)은 **포커스가 곧 커서**다. 포커스를 잃거나 엉뚱한 곳으로 가면 사용자는 리모컨이 고장 난 것으로 느낀다. 그런데 포커스 사고는 화면 문구가 멀쩡해서 **기본 문구 대조(`expect`/`absent`)로는 잡히지 않는다.** 그래서 따로 본다.

이 문서는 `rainbow-vue-app`의 포커스 구현(`CONVENTION.md` §9)과 실제로 터졌던 fix 커밋에서 뽑았다. 레TB(`rainbow-flutter-tvapp`)도 증상은 같고 선택자만 다르다.

---

## 1. 한 줄 원칙

> **모든 키 입력 뒤에 `document.activeElement` 는 id 가 있는 요소여야 하고, 그 id 는 화면이 기억한 id 와 같아야 하며, 그 요소는 화면 안에 보여야 한다.**

이 셋 중 하나라도 깨지면 포커스 사고다. 각각 2장·3장·4장에서 본다.

---

## 2. 포커스가 "사라지는" 경우

### 2-1. id 없는 요소로 간다 → 다음 키에서 튄다

레CTV 리모컨은 `document.activeElement.id` 를 `split('_')` 해서 다음 위치를 정한다. id 가 없으면 `type` 이 빈 문자열이 되어 어느 분기에도 안 걸리고 **화면 기본 포커스로 되돌아간다**(`setMainFocus`). 사용자 눈에는 "한 칸 움직였는데 맨 위로 튄다"로 보인다.

```js
// 모든 키 입력 뒤에 넣는다
const el = await page.evaluate(() => ({
  id: document.activeElement.id,
  tag: document.activeElement.tagName,
}));
// id 가 '' 이거나 body 면 사고
```

판정: `extra: [{ text: `포커스 id=${el.id}`, ok: !!el.id && el.tag !== 'BODY' }]`

### 2-2. 목록이 다시 그려지면서 포커스가 날아간다

`:key` 가 바뀌어 컴포넌트가 재마운트되면 포커스하던 DOM 이 사라진다. 실제 사례:

- `83e8929c` — 배너 목록이 바뀌자 swiper 재마운트로 포커스 증발
- 배너는 **활성 슬라이드에만** `id="banner_0"` 이 붙는다(`:id="activeIndex === index ? 'banner_0' : ''"`). 슬라이드를 넘기면 이전 `banner_0` 은 id 를 잃는다
- `02625f93` — 그 재포커스 타이머 변수명이 오타(`movePrevTimout`)라 `ReferenceError` 가 **빈 `try/catch` 에 묻혀** 조용히 죽었다

검수에서 볼 것: 배너 좌우로 넘긴 뒤, 목록이 늦게 채워지는 화면에서 **데이터 도착 전후로** 포커스가 유지되는지.

### 2-3. 늦게 오는 데이터가 포커스를 가져간다

- `0ebc467a` — 로그인 QR 2분 갱신이 **팝업이 떠 있는데도** `login_0` 으로 포커스를 끌어갔다. 타이머·폴링이 `focus()` 를 부를 때는 "지금 모달이 열려 있나"를 먼저 봐야 한다.

검수에서 볼 것: 팝업을 띄워 둔 채 **갱신 주기(QR 2분, 광고 10초 등)를 넘겨** 포커스가 그대로인지.

### 2-4. 조회가 실패해도 화면 차례를 닫아야 한다

레일이 순차로 열리는 화면(`setIsSetData` → 다음 `showData`)에서 중간 한 칸이 응답을 못 받고 아무것도 안 하면 **그 뒤 레일이 영영 안 열리고 포커스도 못 간다.** `apiLoading true` 를 보내고 `false` 를 빠뜨리면 리모컨 자체가 멈춘다(`CONVENTION.md` §17.1-6).

검수에서 볼 것: 응답을 비우거나 실패시킨 뒤(`page.route` 로 가로채기) **그 아래 구역으로 내려갈 수 있는지**.

---

## 3. 포커스가 "엉뚱한 곳"으로 가는 경우

### 3-1. 기억한 id 와 실제 id 가 다르다

화면은 `remoteFocus/changeBeforeRemoteId` 로 마지막 포커스를 기억했다가 복귀 때 쓴다. `@focus` 에서 **실제 id 와 다른 값**을 기록하면 복귀가 엉뚱한 데로 간다.

- `MediaSuggestMainLayout.onFocus` 가 `suggest_${index}` 를 기록하는데 실제 id 는 `suggest_${key}_${index}` 다. 지금은 remote 이동 메서드가 곧바로 덮어써서 드러나지 않을 뿐이다.

검수에서 볼 것: 상세 → 뒤로가기, 모달 닫기 뒤 **"눌렀던 그 카드"로 돌아오는지**. 한 칸 옆이나 레일 첫 칸으로 가면 사고다.

```js
const before = await page.evaluate(() => document.activeElement.id);
// 상세 열고 닫기
const after = await page.evaluate(() => document.activeElement.id);
// before === after 여야 한다
```

### 3-2. 상세·모달에서 밖으로 빠진다

- `8ff5b788` — 알림 모달에서 remote 의 `else` 폴백이 포커스를 모달 밖으로 보냈다. 닫기 버튼이 없는 필수 모달은 `focusin` + capture `keydown` 트랩이 있어야 한다.

검수에서 볼 것: 모달을 띄우고 **상하좌우를 각각 5번 이상** 눌러도 `activeElement` 가 모달 안에 남는지. 뒤로가기 키도 함께.

### 3-3. 라우트가 바뀌었는데 헤더 활성 탭이 그대로다

- `5a2ab19c` — webOS 에서 라우트가 바뀌어도 헤더 탭이 안 따라왔고, 홈 이동 뒤 포커스가 이전 탭에 남았다. `setIsHeaderFocus` 는 **현재 라우트를 보고** 대상을 찾으므로 `router.replace().then()` 안에서 불러야 한다.

검수에서 볼 것: 채널을 옮긴 뒤 **헤더의 `active` 클래스가 붙은 탭**과 실제 라우트가 같은지.

```js
const tab = await page.evaluate(() => {
  const el = document.querySelector('[id^="header_"].active');
  return { active: el && el.id, path: location.hash };
});
```

### 3-4. 구역이 늘거나 줄면 번호가 어긋난다

탭·구역 id 를 번호로 하드코딩하면(`tab_1` = VOD 처럼) 탭이 하나 끼어드는 순간 전부 밀린다. 6차에서 스크린채널 탭·분류가 **회원마다 개수가 다르게** 들어오므로 특히 위험하다.

- 찜 분류(CTVR-16644), 시청내역 탭(CTVR-16289), GNB(CTVR-16289) 모두 개수가 가변이다.

검수에서 볼 것: 분류·탭 id 가 `tab_0` 부터 **빠짐없이 연속**인지, 그 차례가 화면에 보이는 차례와 같은지.

```js
const tabs = await page.$$eval('.filter-tab', els => els.map(e => ({ id: e.id, text: e.textContent.trim() })));
// tabs.every((t, i) => t.id === `tab_${i}`)
```

### 3-5. 끝에서 더 누르면 아무 일도 안 일어난다

- `b3aa8d8f` — 알림 목록 맨 아래에서 ↓ 를 누르면 반응이 없었다. 세로 리스트 끝은 처음으로 순환해야 한다.
- `503b67e1` — 2열 목록에서 `_last` 계산과 remote 의 `± 열 수` 가 어긋나 하단 이동이 깨졌다. **열 수를 바꾸면 Layout 의 `_last`, remote 의 `% N`/`± N`, CSS 그리드 폭을 함께** 바꿔야 한다.

검수에서 볼 것: 목록 **맨 끝에서 한 번 더** 누르기. 상하좌우 네 방향 모두.

---

## 4. 포커스는 맞는데 "화면 밖"인 경우

눈에 가장 잘 띄는 사고다. 포커스는 옮겨졌는데 그 요소가 보이지 않아 사용자는 커서를 잃는다.

- `b92dadea` — GNB 탭이 8개를 넘자 끝 탭이 포커스를 받아도 화면 밖에 남았다. `focusWithoutScroll` 이 포커스 뒤 50ms 동안 스크롤을 되돌려 `scrollIntoView` 를 취소시킨 것이 원인이었다. **`preventScroll` 로 포커스한 뒤 직접 맞추는** 방식으로 고쳤다.
- `8dc20a43` — `back_0` 에 직접 `focus()` 만 하고 스크롤을 안 맞춰 화면 밖에 있었다. 직접 `focus()` 할 때는 `scrollIntoView({inline:'nearest', block:'center'})` 를 같이 부른다.
- `5a2ab19c` — 고정(fixed) 헤더에 `block:'center'` 를 쓰자 문서 전체가 세로로 밀렸다. fixed 요소에는 `block:'nearest'`.

검수에서 볼 것: **탭·레일이 화면 폭을 넘길 때**(스크린채널 8개 이상, 분류 6개 이상) 끝까지 이동해 보기.

```js
const vis = await page.evaluate(() => {
  const r = document.activeElement.getBoundingClientRect();
  return { inX: r.left >= 0 && r.right <= innerWidth, inY: r.top >= 0 && r.bottom <= innerHeight, scrollY };
});
// inX && inY 여야 한다. scrollY 가 튀면 fixed 요소에 block:'center' 를 쓴 것일 수 있다
```

---

## 5. 플랫폼 입력 함정

| 함정 | 내용 | 근거 |
| --- | --- | --- |
| webOS 매직리모컨 | 포인터 움직임이 keyCode `4`/`1536` 으로 들어와 Back 으로 오인식된다. **본문에서 4/1536 을 Back 으로 처리하지 않는다** | `c80e2823`, `CONVENTION.md` §17.1-10 |
| Tizen 뒤로가기 | keyCode `10009`. webOS 와 값이 다르다 | 인수인계서 6장 |
| 화면이 키를 직접 받는 것 | 화면 컴포넌트에서 `window.addEventListener('keydown')` 을 쓰지 않는다. 예외는 구성 변경 안내 팝업(`Home.vue` capture)뿐이고 사유가 주석으로 남아 있다 | `CONVENTION.md` §17.1-3 |
| 포커스 코드의 빈 try/catch | 오류가 묻혀 "아무 일도 안 일어남"이 된다. 포커스 코드를 빈 `catch` 로 감싸지 않는다 | `02625f93`, §17.1-9 |

---

## 6. 시나리오에 넣는 공통 도우미

먼저 걸리기 쉬운 것들. 모두 **앱 버그처럼 보이지만 시나리오 쪽 문제**다. 실제로 이 다섯에 다 걸려서 멀쩡한 코드를 고쳤다가 되돌린 적이 있다.

- **해시 라우터다.** 레CTV 는 `http://127.0.0.1:5102/#/main/favorite` 꼴이다. `#/` 를 빼고 `goto` 하면 그 화면이 아니라 기본 화면이 열리고, 찾는 DOM 이 0개로 나와 "구현이 안 됐다"로 오판한다. 로그인 직후 `location.href` 를 한 번 찍어 확인한다.
- **같은 해시로 `goto` 하면 문서를 다시 읽지 않는다.** same-document 이동이라 vuex 메모리 캐시가 그대로 살아 있다. localStorage 를 지워도 메모리에서 꺼내 쓰므로 **요청이 한 건도 안 나가고**, "캐시를 지웠는데 왜 안 부르지"가 된다. 화면을 진짜로 다시 띄우려면 `page.reload()` 를 쓴다.
- **캐시가 맞으면 요청이 아예 없다.** 레CTV 는 목록 대부분을 회원 × 키 단위로 다음 정각까지 캐시한다(`CMB_CSH_FRS_001`). 캐시가 더운 상태면 리로드해도 XHR 이 0건일 수 있다. "요청 0건"을 버그로 읽지 말고, 저장 키(`sectionCache_<키>`)가 기대한 이름으로 만들어졌는지로도 판정할 수 있게 해 둔다.
- **레일이 차례로 열린다.** `setIsSetData` 로 앞 줄이 끝나야 다음 줄이 열리므로 아래쪽 구역(광고 줄 등)은 10\~20초 뒤에 뜬다. 고정 대기로 찍으면 "안 그려졌다"가 나온다. **생길 때까지 폴링**한다.
- **선택자를 좁게 잡지 않는다.** 상위 래퍼를 끼워 `.wrap-tab .filter-tab` 처럼 쓰면 마크업이 조금만 달라도 0개가 된다. 판정에 쓸 요소는 가장 특징적인 클래스 하나(`.filter-tab`)로 잡는다.
- **기대값 조회는 화면 이동 전에 끝낸다.** 화면이 이동 중이면 `page.evaluate` 안의 `fetch` 가 끊겨 `Failed to fetch` 가 난다. 토큰으로 서버를 직접 부르는 기대값 조회는 이동 전에 하고, 비면 다시 시도한다.

> **판정을 바꾸기 전에 관측을 의심한다.** "요청이 없다"는 앱이 안 불렀다는 뜻일 수도, 캐시가 맞았다는 뜻일 수도, 리로드가 안 됐다는 뜻일 수도, 아직 그 줄이 안 열렸다는 뜻일 수도 있다. 넷을 가르기 전에는 앱 코드를 고치지 않는다.

아래는 `.js` 시나리오에서 그대로 복사해 쓴다. 판정은 `check` 의 `extra` 로 넣어야 보고서에 남는다.

```js
// 지금 포커스 상태를 한 번에 읽는다
const focusState = page => page.evaluate(() => {
  const el = document.activeElement;
  const r = el.getBoundingClientRect();
  return {
    id: el.id,
    tag: el.tagName,
    cls: el.className,
    inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
    scrollY: window.scrollY,
  };
});

// 키를 누르고 포커스가 성한지 본다
async function press(page, key, times = 1) {
  const trail = [];
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1200);
    trail.push(await focusState(page));
  }
  return trail;
}

// 판정 한 줄로 만들기
const focusOk = t => ({
  text: `${t.map(f => f.id || '(id없음)').join(' → ')}`,
  ok: t.every(f => f.id && f.tag !== 'BODY' && f.inView),
});
```

사용 예:

```js
const trail = await press(s.page, 'ArrowRight', 12);   // 탭 끝까지 밀어 본다
await s.check('03-tab-right', {
  screen: '분류 오른쪽 끝까지 이동',
  expect: [],
  extra: [focusOk(trail), { text: '끝에서 더 눌러도 포커스 유지', ok: !!trail.at(-1).id }],
});
```

---

## 7. 화면별 최소 점검 목록

새 TV 화면을 검수하면 아래를 기본으로 돈다. 해당 없는 항목은 `info` 로 사유를 남긴다.

| # | 점검 | 사고 유형 |
| --- | --- | --- |
| 1 | 화면 진입 직후 포커스 위치가 규칙과 같은가 (GNB 진입은 헤더에 남는다) | 2-1 |
| 2 | 상하좌우 각 방향으로 **끝까지** 이동 → 전 구간 id 유지·화면 안 | 2-1, 3-5, 4 |
| 3 | 끝에서 **한 번 더** 누르기 (순환 또는 멈춤이 규칙대로인가) | 3-5 |
| 4 | 구역이 0건이라 안 그려질 때 그 구역을 **건너뛰는가** (멈추지 않는가) | 2-4 |
| 5 | 상세 열고 닫기 → **눌렀던 그 요소**로 복귀 | 3-1 |
| 6 | 모달에서 사방 5회 이상 + 뒤로가기 → 밖으로 안 빠지는가 | 3-2 |
| 7 | 채널·탭 이동 뒤 헤더 `active` 와 라우트가 같은가 | 3-3 |
| 8 | 탭·분류 id 가 `tab_0` 부터 연속인가 (개수 가변 화면) | 3-4 |
| 9 | 폭을 넘기는 탭·레일의 끝 항목이 화면 안에 들어오는가 | 4 |
| 10 | 갱신 타이머(QR 2분, 광고 10초)를 넘겨도 포커스가 그대로인가 | 2-3 |
| 11 | 응답을 비우거나 실패시켜도 그 아래로 이동되는가 | 2-4 |

---

## 8. 6차에서 특히 위험한 자리

스크린채널이 **회원마다 개수가 달라지면서** 번호 기반 포커스 코드가 전부 위험해졌다.

| 자리 | 왜 | 티켓 |
| --- | --- | --- |
| GNB 탭 | 회원에게 보이는 채널만 담겨 와 개수가 다르다. 8개 넘으면 가로 스크롤 | CTVR-16289, `b92dadea` |
| 스크린채널 화면 구역 | 탑배너·추천·옐로배너·메뉴가 각각 0건이면 빠진다. **구역 차례가 기기마다 다르다**(레모글라스만 옐로배너가 추천 위) | CTVR-16307, CTVR-16621 |
| 시청내역 탭 | 채널 탭이 가변으로 붙는다 | CTVR-16289 |
| 찜 분류 | 채널 분류가 가변이고 0건이면 숨긴다 | CTVR-16644 |
| 구성 변경 안내 팝업 | GNB 가 바뀌면 어느 화면에서든 다음 조작에 끼어든다. 그 키가 화면 이동으로 쓰이면 안 된다 | CTVR-16289 |

---

## 9. 보고서에 남기는 법

- 포커스 판정은 **`extra` 로 넣는다.** 스크린샷만 남기면 "그때 커서가 어디였는지" 가 안 남는다.
- 이동 경로를 `id → id → id` 로 적는다. 어디서 끊겼는지 바로 보인다.
- 화면으로 확인 못 한 항목은 `s.info(...)` 로 **사유와 함께** 남긴다. 보고서 맨 위 "직접 확인할 것"에 모인다.
- 포커스는 사람 눈으로 봐야 확실한 항목이 많다. 영상(`video: true`)을 켜 두고 최종 판정은 사람이 한다.
