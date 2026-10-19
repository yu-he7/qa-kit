// 레CTV(vue-app) CTVR-16651 옐로배너 · 레드 인스트림 광고를 스크린채널 키(scIdx)로 조회
// QA 로컬 패치(커밋 안 함): config.js isDev=true(기본값이 운영), checkVersion webos ve='99.0'
//
// 광고는 "보인다/안 보인다" 만으로는 판정이 안 된다. 계정과 CMS 타겟에 따라 0건이 정상일 수 있기 때문이다.
// 그래서 나가는 요청 자체를 가로채 경로(v1/v2)와 scIdx 를 본다. 이게 이 티켓의 핵심 판정이다.
// 포커스 판정은 docs/TV-FOCUS.md 기준을 따른다. 옐로배너는 구역 하나를 더 끼우는 변경이라
// 위아래 이동이 끊기지 않는지 함께 본다.
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
  return {
    id: el.id, tag: el.tagName,
    inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
    scrollY: window.scrollY,
  };
});
async function press(page, key, times = 1, wait = 1200) {
  const trail = [];
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(wait);
    trail.push(await focusState(page));
  }
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
// 광고 목록은 회원 × 채널별로 다음 정각까지 캐시한다. 캐시가 맞으면 서버를 부르지 않아
// "요청 0건"이 나오고, 이게 버그처럼 보인다. 요청을 보려면 먼저 지운다.
// 메모리 캐시는 vuex 에 있으므로 지운 뒤 전체 로드(goto)로 초기화한다.
const clearAdvCache = page => page.evaluate(() => {
  Object.keys(localStorage)
    .filter(k => k.indexOf('sectionCache_adv_') > -1 || k === 'advIndex')
    .forEach(k => localStorage.removeItem(k));
});

// 해시 라우터다. `#/` 를 빼면 그 화면이 아니라 기본 화면이 열린다 (TV-FOCUS.md 6장)
async function open(s, path) {
  await s.page.goto(base + path, { waitUntil: 'load', timeout: 90000 });
  await s.page.waitForTimeout(8000);
  await closePopup(s.page);
}
// 광고 요청을 반드시 보고 싶을 때. 캐시를 지우고 그 화면을 진짜로 다시 띄운다.
//
// 주의 두 가지.
// 1) 해시 라우터라 지금과 같은 해시로 goto 하면 문서를 다시 읽지 않는다(same-document).
//    그러면 vuex 메모리 캐시가 그대로 살아 있어 요청이 안 나가고, 캐시를 안 지운 것처럼 보인다. reload 를 쓴다.
// 2) 레일이 차례로 열려 광고 줄은 10~20초 뒤에 뜬다. 고정 대기로는 "요청 없음"을 잘못 보게 되므로 생길 때까지 기다린다.
async function openFresh(s, path, seen) {
  await open(s, path);
  await clearAdvCache(s.page);
  seen.length = 0;
  await s.page.reload({ waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 8; i++) {
    await s.page.waitForTimeout(5000);
    await closePopup(s.page);
    if (seen.some(r => r.acdType === 'BANNER')) break;
  }
}

(async () => {
  console.log('login ->', await ctvLogin(base, storage));
  const s = await session({ app: 'vue-app', ticket: 'CTVR-16651', title: '광고 조회를 스크린채널 키로 전환', base, storage, viewport });
  await s.ctx.addInitScript(webosStub);

  // 광고 요청을 전부 기록한다. 경로(v1/v2)와 scIdx 가 이 티켓의 판정 근거다
  const adReqs = [];
  await s.ctx.route('**/api/*/advertise/**', route => {
    const u = new URL(route.request().url());
    adReqs.push({
      ver: u.pathname.includes('/v2/') ? 'v2' : (u.pathname.includes('/v1/') ? 'v1' : '?'),
      path: u.pathname,
      acdType: u.searchParams.get('acdType'),
      scIdx: u.searchParams.get('scIdx'),
      mcType: u.searchParams.get('mcType'),
    });
    route.continue();
  });
  const takeAds = (acdType) => {
    const got = adReqs.filter(r => r.acdType === acdType);
    adReqs.length = 0;
    return got;
  };
  // 광고 목록은 회원 × 채널별로 캐시한다. 캐시가 맞으면 서버를 부르지 않아 요청이 0건이 되는데,
  // 이때도 저장 키(`adv_CHANNEL_{scIdx}`)가 그 채널 키로 만들어졌는지로 판정할 수 있다.
  const advCacheKeys = page => page.evaluate(() => Object.keys(localStorage)
    .filter(k => k.indexOf('sectionCache_adv_') > -1)
    .map(k => k.slice(k.indexOf('sectionCache_adv_') + 'sectionCache_adv_'.length)));

  const adsOk = (got, expectScIdx, cacheKeys) => {
    const wantKey = `CHANNEL_${expectScIdx}`;
    if (got.length === 0) {
      // 캐시 적중. 요청 대신 저장 키로 본다
      return [
        { text: `요청 0건(캐시 적중). 저장 키로 판정 — 기대 ${wantKey}, 실제 [${cacheKeys.join(', ')}]`, ok: cacheKeys.includes(wantKey) },
        { text: `5차 값(RAINBOW·VOD 등) 저장 키가 남아 있지 않음`, ok: !cacheKeys.some(k => k.indexOf('CHANNEL_') !== 0) },
      ];
    }
    return [
      { text: `요청 ${got.length}건 전부 v2 (${got.map(r => r.ver).join(',')})`, ok: got.every(r => r.ver === 'v2') },
      { text: `mcType 을 보내지 않음`, ok: got.every(r => r.mcType === null) },
      { text: `scIdx=${expectScIdx} 로 보냄 (실제 ${got.map(r => r.scIdx).join(',')})`, ok: got.every(r => String(r.scIdx) === String(expectScIdx)) },
    ];
  };

  // 기대값: GNB 에서 채널별 scIdx 를 받아 둔다. 화면 이동 전에 끝낸다 (TV-FOCUS.md 6장)
  await open(s, '/#/main');
  let gnb = { list: [] };
  for (let i = 0; i < 4; i++) {
    gnb = await s.page.evaluate(async (api) => {
      const t = JSON.parse(localStorage.getItem('com.dgmonglab.rainbowtv_apptoken'));
      const r = await fetch(`${api}/api/v1/screen-channel/WEBOS`, { headers: { Authorization: `Bearer ${t}` } });
      const j = await r.json();
      return { list: (j?.result?.list || []).map(c => ({ scIdx: c.scIdx, scCode: c.scCode, scName: c.scName })) };
    }, API).catch(e => ({ list: [], error: e.message }));
    if (gnb.list.length) break;
    await s.page.waitForTimeout(3000);
  }
  const byCode = code => (gnb.list.find(c => c.scCode === code) || {}).scIdx;
  console.log('gnb:', JSON.stringify(gnb.list));

  // ── AC-1 · AC-2 기존 채널 옐로배너가 v2 + scIdx 로 나가는지 ──────────────
  const screens = [
    { label: '나의 레인보우', path: '/#/main', scIdx: byCode('myrainbow') },
    { label: 'VOD', path: '/#/main/vod', scIdx: byCode('vod') },
    { label: '우클', path: '/#/main/class', scIdx: byCode('class') },
    { label: '쇼핑', path: '/#/main/shop', scIdx: byCode('shop') },
  ];
  let idx = 1;
  for (const sc of screens) {
    if (!sc.scIdx) { s.info(`0${idx++}-adv-${sc.label}`, { screen: `${sc.label} 옐로배너`, note: `GNB 에 그 채널이 없어 기대 scIdx 를 만들 수 없음` }); continue; }
    await openFresh(s, sc.path, adReqs);
    const got = takeAds('BANNER');
    await s.check(`0${idx++}-adv-${sc.label}`, { screen: `${sc.label} 화면 옐로배너 요청`, expect: [], extra: adsOk(got, sc.scIdx, await advCacheKeys(s.page)) });
    s.result.checks.at(-1).note = `${PATCH} 요청: ${JSON.stringify(got)}`;
  }

  // ── AC-3 스크린채널 화면도 같은 경로인지 (CTVR-16621 과 함께 회귀 확인) ──
  const custom = gnb.list.find(c => c.scCode === null) || gnb.list.find(c => c.scCode === 'jjam');
  if (custom) {
    // 이 채널에 옐로배너 말고 어떤 구역이 그려지는지 서버에서 먼저 받는다.
    // 구역이 하나도 없으면 옐로배너에 머무는 것이 설계대로다(메뉴 줄이 없으면 머문다, CTVR-16621).
    // 이 값이 없으면 "안 움직인다"가 정상인지 버그인지 가릴 수 없다.
    const sections = await s.page.evaluate(async ({ api, scIdx, mcIdx }) => {
      const t = JSON.parse(localStorage.getItem('com.dgmonglab.rainbowtv_apptoken'));
      const h = { Authorization: `Bearer ${t}` };
      const pick = async url => { try { const j = await (await fetch(url, { headers: h })).json(); return (j?.result?.list || []).length; } catch (e) { return null; } };
      return {
        menus: await pick(`${api}/api/v2/media/WEBOS/category/${mcIdx}`),
        suggest: await pick(`${api}/api/v4/WEBOS/recommend/menu?scIdx=${scIdx}`),
      };
    }, { api: API, scIdx: custom.scIdx, mcIdx: custom.mcIdx }).catch(() => ({ menus: null, suggest: null }));
    console.log('sections:', JSON.stringify(sections));
    const hasBelowAdv = (sections.menus || 0) > 0;

    await openFresh(s, `/#/main/${custom.scCode === 'jjam' ? 'jjam' : 'sc' + custom.scIdx}`, adReqs);
    const got = takeAds('BANNER');
    await s.check(`0${idx++}-adv-screenchannel`, { screen: `${custom.scName} 화면 옐로배너 요청`, expect: [], extra: adsOk(got, custom.scIdx, await advCacheKeys(s.page)) });
    s.result.checks.at(-1).note = `${PATCH} 요청: ${JSON.stringify(got)}`;

    // ── 포커스: 옐로배너가 낀 구역 이동이 끊기지 않는가 (TV-FOCUS.md 7장 2·3·9) ──
    // 구역 차례는 탑배너 > 추천 > 옐로배너 > 메뉴다 (CMB_SC_FRS_028, CTVR-16621)
    await s.page.evaluate(() => { const h = document.getElementById('header_scroll'); if (h) h.focus(); });
    await s.page.waitForTimeout(1500);
    const down = await press(s.page, 'ArrowDown', 10);
    await s.check(`0${idx++}-focus-down`, {
      screen: `${custom.scName} 화면 아래로 10회`,
      expect: [],
      extra: [
        focusOk('아래 이동', down),
        { text: `옐로배너(adv_0)를 지나감`, ok: down.some(f => f.id === 'adv_0') },
        hasBelowAdv
          ? { text: `옐로배너 아래 메뉴 줄로 내려감 (메뉴 ${sections.menus}개)`, ok: down.some(f => f.id && f.id.indexOf('cate_') === 0) }
          : { text: `옐로배너 아래 구역이 없어 머무름 (메뉴 ${sections.menus}개, 추천 ${sections.suggest}개) — 설계대로`, ok: down.every(f => !!f.id) },
      ],
    });
    s.result.checks.at(-1).note = `${PATCH} 구역 차례는 탑배너 > 추천 > 옐로배너 > 메뉴. 서버에서 받은 구역 수: ${JSON.stringify(sections)}`;

    const up = await press(s.page, 'ArrowUp', 10);
    await s.check(`0${idx++}-focus-up`, {
      screen: `${custom.scName} 화면 위로 10회`,
      expect: [],
      extra: [
        focusOk('위 이동', up),
        { text: `맨 위에서 더 눌러도 포커스 유지`, ok: !!up.at(-1).id },
      ],
    });

    // 옐로배너에 포커스를 두고 좌우로 밀어 본다. 광고는 한 칸이라 빠져나가면 안 된다
    const advDom = await s.page.$('#adv_0');
    if (advDom) {
      await s.page.focus('#adv_0'); await s.page.waitForTimeout(1200);
      const side = await press(s.page, 'ArrowRight', 4);
      await s.check(`0${idx++}-focus-adv-side`, {
        screen: '옐로배너에서 좌우 이동',
        expect: [],
        extra: [focusOk('오른쪽', side), { text: '광고 칸에서 id 없는 곳으로 빠지지 않음', ok: side.every(f => !!f.id) }],
      });
    } else {
      s.info(`0${idx++}-focus-adv-side`, { screen: '옐로배너에서 좌우 이동', note: '이 계정·채널에 노출할 옐로배너가 없어 판정 불가' });
    }
  } else {
    s.info(`0${idx++}-adv-screenchannel`, { screen: '스크린채널 화면 옐로배너', note: 'GNB 에 짬짬운동·신규 스크린채널이 없어 판정 불가' });
  }

  // ── AC-4 · AC-5 레드 인스트림이 v2 + scIdx 로 나가는지 ──────────────────
  // 재생까지 가야 요청이 생긴다. 화면 구성에 따라 못 갈 수 있으므로 못 가면 사유를 남긴다
  const vodScIdx = byCode('vod');
  adReqs.length = 0;
  await open(s, '/#/main/vod');
  await s.page.evaluate(() => { const h = document.getElementById('header_scroll'); if (h) h.focus(); });
  await s.page.waitForTimeout(1500);
  await press(s.page, 'ArrowDown', 4);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(9000);
  await closePopup(s.page);
  const instream = takeAds('INSTREAM');
  if (instream.length) {
    await s.check(`0${idx++}-instream`, {
      screen: 'VOD 콘텐츠 상세의 레드 인스트림 요청',
      expect: [],
      extra: adsOk(instream, vodScIdx),
    });
    s.result.checks.at(-1).note = `${PATCH} 요청: ${JSON.stringify(instream)} · 상세 v2 의 scIdx 를 먼저 쓰고 없으면 5차 유형으로 찾는다.`;
  } else {
    s.info(`0${idx++}-instream`, { screen: '레드 인스트림 요청', note: `상세까지 가지 못했거나 광고 주기가 아직 아님. 그동안 기록된 광고 요청: ${JSON.stringify(adReqs)}` });
  }

  const r = await s.close();
  console.log('16651 hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
