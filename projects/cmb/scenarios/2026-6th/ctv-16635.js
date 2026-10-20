// 레CTV(vue-app) CTVR-16635 6차 신규 스크린채널 API 전환
// (상세 아래 인기·유사, 검색 전 인기, 나의 레인보우 내 추천, 알림함, 팝업)
// QA 로컬 패치(커밋 안 함): config.js isDev=true, checkVersion webos ve='99.0'
//
// 판정 방법: 나가는 요청을 가로채 경로 버전을 본다.
//   구버전 경로는 CTVR-16398 로 6차 콘텐츠를 빼고 주므로, 어느 경로를 부르는지가 이 티켓의 전부다.
//   "화면에 6차 콘텐츠가 보인다" 로는 판정이 안 된다. 계정·데이터에 따라 0건이 정상일 수 있다.
//
// 데이터 준비: 짬짬운동·신규 스크린채널 콘텐츠를 찜해 둔다(CTVR-16644 검증에도 쓴다).
//   앱이 쓰는 것과 같은 경로(POST api/v3/media/{platform}/like/{meIdx})로 등록한다.
//
// 포커스 판정은 docs/TV-FOCUS.md 기준을 따른다.
const { session, statePath } = require('../../../../lib/web');
const { ctvLogin, webosStub } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5102';
const storage = statePath('ctv');
const viewport = { width: 1920, height: 1080 };
const API = 'https://java-api-dev.cmbrainbowtv.co.kr';
const PATCH = 'QA 로컬 패치 2줄(dev API 지정, webOS 버전 99.0)로 실행. 커밋 안 함.';

// ── TV-FOCUS.md 공통 도우미 ────────────────────────────────────────────────
const focusState = page => page.evaluate(() => {
  const el = document.activeElement;
  const r = el.getBoundingClientRect();
  return { id: el.id, tag: el.tagName, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
});
async function press(page, key, times = 1, wait = 1200) {
  const trail = [];
  for (let i = 0; i < times; i++) { await page.keyboard.press(key); await page.waitForTimeout(wait); trail.push(await focusState(page)); }
  return trail;
}
const focusOk = (label, trail) => ({
  text: `${label}: ${trail.map(f => f.id || '(id없음)').join(' → ')}`,
  ok: trail.every(f => f.id && f.tag !== 'BODY' && f.inView),
});

async function closePopup(page) {
  for (let i = 0; i < 3; i++) {
    const b = page.getByText('닫기', { exact: true });
    if (!(await b.count()) || !(await b.first().isVisible())) return;
    await b.first().click().catch(() => {}); await page.waitForTimeout(1500);
  }
}
// 해시 라우터다. `#/` 를 빼면 그 화면이 아니라 기본 화면이 열린다 (TV-FOCUS.md 6장)
// 해시만 다른 goto 는 문서를 다시 읽지 않는다(같은 문서 이동). 그러면 헤더가 다시 뜨지 않아
// 헤더가 부르는 요청(알림 안 읽은 수)이 측정 구간에 잡히지 않고, 메모리 캐시도 그대로 살아 있다.
// 그래서 goto 전에 빈 문서로 한 번 빠져나와 반드시 새 문서로 열리게 한다.
// (goto 뒤에 reload 를 더하면 첫 로딩이 끊겨 초기 조회가 통째로 날아간다)
async function open(s, path, wait = 9000) {
  await s.page.goto('about:blank');
  await s.page.goto(base + path, { waitUntil: 'load', timeout: 90000 });
  await s.page.waitForTimeout(wait);
  await closePopup(s.page);
}
// 같은 해시로 goto 하면 문서를 다시 읽지 않아 메모리 캐시가 살아 있다. 캐시를 비우려면 reload 를 쓴다
async function reopen(s, wait = 12000) {
  await s.page.reload({ waitUntil: 'load', timeout: 90000 });
  await s.page.waitForTimeout(wait);
  await closePopup(s.page);
}

(async () => {
  console.log('login ->', await ctvLogin(base, storage));
  const s = await session({ app: 'vue-app', ticket: 'CTVR-16635', title: '6차 신규 스크린채널 API 전환', base, storage, viewport });
  await s.ctx.addInitScript(webosStub);

  // 판정 대상 요청을 모두 기록한다
  const reqs = [];
  await s.ctx.route('**/api/**', route => {
    const u = new URL(route.request().url());
    reqs.push({ m: route.request().method(), p: u.pathname, q: u.search });
    route.continue();
  });
  const hit = re => reqs.filter(r => re.test(r.p));
  const clear = () => { reqs.length = 0; };
  // 새 경로를 불렀고 구버전 경로는 부르지 않았는지 본다
  const versionOk = (label, newRe, oldRe) => {
    const got = hit(newRe), old = hit(oldRe);
    return [
      { text: `${label}: 새 경로 ${got.length}건 (${got.map(r => r.p).join(', ') || '없음'})`, ok: got.length > 0 },
      { text: `${label}: 구버전 경로 호출 없음 (${old.map(r => r.p).join(', ') || '없음'})`, ok: old.length === 0 },
    ];
  };

  await open(s, '/#/main');

  // ── 데이터 준비: 짬짬운동·신규 스크린채널 콘텐츠를 찜한다 ────────────────
  // 화면 조작이 아니라 앱이 쓰는 경로로 직접 등록한다. 등록 결과는 찜 목록 v4 로 확인한다.
  // 화면이 아직 이동 중이면 fetch 가 끊겨 빈 결과가 나온다. 채널을 받을 때까지 다시 시도한다 (TV-FOCUS.md 6장)
  const runPrep = () => s.page.evaluate(async (api) => {
    const t = JSON.parse(localStorage.getItem('com.dgmonglab.rainbowtv_apptoken'));
    const h = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
    const get = async u => { try { return await (await fetch(u, { headers: h })).json(); } catch (e) { return { error: e.message }; } };

    const gnb = await get(`${api}/api/v1/screen-channel/WEBOS`);
    const channels = (gnb?.result?.list || []).filter(c => c.scCode === 'jjam' || c.scCode === null).filter(c => c.mcIdx != null);

    const picked = [];
    for (const c of channels) {
      // 그 채널 화면의 메뉴 목록 -> 메뉴별 콘텐츠에서 하나 고른다
      const menus = await get(`${api}/api/v2/media/category/WEBOS/channel/${c.mcIdx}`);
      for (const m of (menus?.result?.list || [])) {
        // 메뉴별 콘텐츠는 앱과 같은 경로를 쓴다 (getMediaCategoryMain, CTVR-16399)
        const list = await get(`${api}/api/v4/media/WEBOS/category/${m.mcIdx}?paging=true&page=1&size=5`);
        const items = list?.result?.list || [];
        const target = items.find(x => x.meIdx && x.mcType);
        if (target) { picked.push({ scIdx: c.scIdx, scName: c.scName, mcIdx: m.mcIdx, meIdx: target.meIdx, mcType: target.mcType, meName: target.meName }); break; }
      }
    }

    // 찜 등록은 앱과 같은 경로를 쓴다 (UserInfo.addMediaLike). -118 은 이미 찜한 상태라 그대로 둔다
    const registered = [];
    for (const p of picked) {
      let add = null;
      try {
        const r = await fetch(`${api}/api/v3/media/WEBOS/like/${p.meIdx}`, { method: 'POST', headers: h, body: '{}' });
        add = await r.json();
      } catch (e) { add = { error: e.message }; }
      const cnt = (await get(`${api}/api/v4/media/WEBOS/like?paging=true&page=1&size=1&scIdx=${p.scIdx}`))?.result?.page?.total ?? 0;
      registered.push({ ...p, addCode: add && add.code, likeTotal: cnt });
    }
    return { channels: channels.length, picked: picked.length, result: registered };
  }, API).catch(e => ({ error: e.message }));

  // dev DB 가 잠깐 불안정하면 -128 로 떨어지고 찜 건수도 0 으로 보인다. 모두 찜이 걸릴 때까지 다시 시도한다
  let prep = { channels: 0, result: [] };
  for (let i = 0; i < 5; i++) {
    prep = await runPrep();
    if ((prep.result || []).length > 0 && prep.result.every(r => r.likeTotal > 0)) break;
    console.log(`데이터 준비 재시도 ${i + 1}:`, JSON.stringify(prep).slice(0, 160));
    await s.page.waitForTimeout(4000);
  }
  console.log('데이터 준비:', JSON.stringify(prep));

  const prepared = (prep.result || []).filter(r => r.likeTotal > 0);
  await s.check('01-data-prep', {
    screen: '검증용 찜 데이터 등록',
    expect: [],
    extra: [
      { text: `찜을 건 6차 채널 ${prepared.length}개 (${prepared.map(r => `${r.scName}(${r.scIdx}) meIdx=${r.meIdx}`).join(', ') || '없음'})`, ok: prepared.length > 0 },
    ],
  });
  s.result.checks.at(-1).note = `${PATCH} 앱과 같은 경로(POST api/v3/media/{platform}/like/{meIdx})로 등록. 조회 결과: ${JSON.stringify(prep)}`;

  // ── 나의 레인보우: 내 추천 v3, 팝업 v3 ──────────────────────────────────
  // 내 추천·팝업도 회원별로 캐시한다. 캐시가 맞으면 요청이 아예 없어 "안 불렀다"로 잘못 읽힌다 (TV-FOCUS.md 6장)
  await s.page.evaluate(() => Object.keys(localStorage)
    .filter(k => /sectionCache_(recommend|adv|banner)/.test(k))
    .forEach(k => localStorage.removeItem(k)));
  clear();
  await reopen(s, 18000);
  await s.check('02-main-my-popup', {
    screen: '나의 레인보우 — 내 추천·팝업 요청',
    expect: [],
    extra: [
      ...versionOk('내 추천', /\/api\/v3\/media\/[^/]+\/my$/, /\/api\/v2\/media\/[^/]+\/my$/),
      ...versionOk('팝업', /\/api\/v3\/banner\//, /\/api\/v2\/banner\/[^/]+(\/ai)?$/),
      { text: `팝업 종류 설정도 v3 (${hit(/\/api\/v3\/banner\/[^/]+\/popup\/setting/).length}건)`, ok: hit(/\/api\/v2\/banner\/[^/]+\/popup\/setting/).length === 0 },
    ],
  });
  s.result.checks.at(-1).note = `${PATCH} 부른 경로: ${JSON.stringify(hit(/(media\/[^/]+\/my|banner)/).map(r => r.p))}`;

  // ── 알림함: 목록·안 읽은 수 v2 ──────────────────────────────────────────
  // 안 읽은 수는 화면이 뜰 때가 아니라 PageHeader 의 `$route.path` 감시로 부른다(알림함으로 갈 때는 빼고).
  // 그래서 문서를 새로 읽는 것만으로는 안 불린다. 알림함을 연 뒤 앱 안에서 다른 화면으로 옮겨 호출을 만든다.
  clear();
  await open(s, '/#/main/alarm', 12000);
  await s.page.evaluate(() => { location.hash = '#/main'; });
  await s.page.waitForTimeout(8000);
  await closePopup(s.page);
  await s.check('03-alarm', {
    screen: '알림함 — 목록·안 읽은 수 요청',
    expect: [],
    extra: [
      ...versionOk('알림 목록', /\/api\/v2\/alarm\/[^/]+\/member$/, /\/api\/v1\/alarm\/[^/]+\/member$/),
      ...versionOk('안 읽은 수', /\/api\/v2\/member\/[^/]+\/alarm\/count$/, /\/api\/v1\/member\/[^/]+\/alarm\/count$/),
    ],
  });
  s.result.checks.at(-1).note = `${PATCH} 부른 경로: ${JSON.stringify(hit(/alarm/).map(r => r.p))}`;

  // ── 검색: 검색 전 인기 콘텐츠 v3 ────────────────────────────────────────
  clear();
  await open(s, '/#/main/search', 10000);
  await s.check('04-search-popular', {
    screen: '검색 화면 — 검색 전 인기 콘텐츠 요청',
    expect: [],
    extra: versionOk('인기 콘텐츠', /\/api\/v3\/media\/[^/]+\/popular$/, /\/api\/v2\/media\/[^/]+\/popular$/),
  });
  s.result.checks.at(-1).note = `${PATCH} 부른 경로: ${JSON.stringify(hit(/popular/).map(r => r.p))}`;

  // ── 포커스 회귀: 나의 레인보우 위아래 이동 ──────────────────────────────
  // 상세·재생을 거치면 세션이 끊겨 로그인 화면으로 돌아갈 수 있어, 포커스는 그 앞에서 본다
  await open(s, '/#/main', 12000);
  await s.page.evaluate(() => { const h = document.getElementById('header_scroll'); if (h) h.focus(); });
  await s.page.waitForTimeout(1500);
  const down = await press(s.page, 'ArrowDown', 8);
  await s.check('05-focus', {
    screen: '나의 레인보우 아래로 8회',
    expect: [],
    extra: [focusOk('아래 이동', down), { text: '같은 자리에서 멈추지 않음', ok: new Set(down.map(f => f.id)).size > 1 }],
  });

  // ── 상세 아래 인기·유사 v3 ──────────────────────────────────────────────
  // 상세는 딥링크(location.hash)로 열리지 않는다. 앞에서 찜해 둔 콘텐츠를
  // 찜 화면에서 포커스로 골라 확인(Enter)으로 연다. TV 라 클릭이 아니라 포커스로 고른다.
  const target = prepared[0];
  if (target) {
    await open(s, '/#/main/favorite', 10000);
    // 그 채널 분류를 고른다. 분류 이름은 scName 과 같다 (CTVR-16644)
    const tabs = await s.page.$$eval('.filter-tab', els => els.map(e => ({ id: e.id, text: (e.textContent || '').trim() })));
    const ti = tabs.findIndex(t => t.text === target.scName);
    if (ti >= 0) { await s.page.focus(`#${tabs[ti].id}`); await s.page.waitForTimeout(6000); await closePopup(s.page); }
    // 찜 화면 항목 id 는 favorite_N 이다 (media_N 은 다른 화면 것이라 여기서는 안 잡힌다)
    const firstId = await s.page.evaluate(() => { const e = document.querySelector('[id^="favorite_"]'); return e ? e.id : null; });
    clear();
    if (firstId) {
      await s.page.focus(`#${firstId}`);
      await s.page.waitForTimeout(1500);
      await s.page.keyboard.press('Enter');
      await s.page.waitForTimeout(9000);
      await closePopup(s.page);
    }
    const pop = hit(/\/api\/v\d\/media\/[^/]+\/popularity\//);
    const sim = hit(/\/api\/v\d\/media\/[^/]+\/similar\//);
    if (pop.length || sim.length) {
      await s.check('06-detail-recommend', {
        screen: `${target.scName} 콘텐츠 상세 — 인기·유사 요청`,
        expect: [],
        extra: [
          ...versionOk('인기 추천', /\/api\/v3\/media\/[^/]+\/popularity\//, /\/api\/v2\/media\/[^/]+\/popularity\//),
          ...versionOk('유사 영상', /\/api\/v3\/media\/[^/]+\/similar\//, /\/api\/v2\/media\/[^/]+\/similar\//),
        ],
      });
      // 연 콘텐츠는 그 분류의 첫 항목이라 준비한 meIdx 와 다를 수 있다. 실제로 연 대상은 요청 경로 끝 숫자로 남는다
      s.result.checks.at(-1).note = `${PATCH} 찜 화면 '${target.scName}' 분류 첫 항목(${firstId})을 확인으로 열었다. 부른 경로: ${JSON.stringify(pop.concat(sim).map(r => r.p))}`;
    } else {
      s.info('06-detail-recommend', { screen: '상세 아래 인기·유사', note: `상세를 열지 못해 요청이 생기지 않음. 분류=${target.scName}, 항목=${firstId}. 부른 경로: ${JSON.stringify(reqs.map(r => r.p).slice(0, 10))}` });
    }
  } else {
    s.info('06-detail-recommend', { screen: '상세 아래 인기·유사', note: '찜을 걸 6차 콘텐츠를 찾지 못해 상세를 열 대상이 없음' });
  }

  const r = await s.close();
  console.log('16635 hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
