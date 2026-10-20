// 레CTV(vue-app) CTVR-16644 AC-5·6·7 목록에서 연 콘텐츠 대체 이동
// QA 로컬 패치(커밋 안 함): config.js isDev=true, checkVersion webos ve='99.0'
//
// 선행 상태(이 시나리오만으로는 만들 수 없다):
//   QA레CTV(scIdx 104)를 CTV 배열에서 내려 미노출로 두고, 그 채널 콘텐츠(meIdx 16066)를 찜해 둔 계정.
//   그래야 "목록에는 남아 있지만 상세 진입이 -37019 로 거절되는 콘텐츠" 가 생긴다.
//   선행 상태가 아니면 판정하지 않고 info 로 사유를 남긴다.
//
// 판정 기준 (CTVR-14443 댓글 50036, 2026-10-19 19:04 편집본):
//   AC-5 찜 화면에서 열면 팝업 없이 GNB 첫 번째 스크린채널로 간다
//   AC-6 이미 첫 번째 채널이면 이동 없이 머물고 화면을 새로 읽지 않는다
//   AC-7 검색·추천 등 다른 경로에서 열면 지금처럼 팝업으로 안내한다
//
// 포커스 판정은 docs/TV-FOCUS.md 기준을 따른다.
const { session, statePath } = require('../../../../lib/web');
const { ctvLogin, webosStub } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5102';
const storage = statePath('ctv');
const viewport = { width: 1920, height: 1080 };
const API = 'https://java-api-dev.cmbrainbowtv.co.kr';
const PATCH = 'QA 로컬 패치 2줄(dev API 지정, webOS 버전 99.0)로 실행. 커밋 안 함.';
const HIDDEN_SC = Number(process.env.HIDDEN_SC || 104);      // 미노출로 둔 스크린채널
const HIDDEN_ME = Number(process.env.HIDDEN_ME || 16066);    // 그 채널의 찜해 둔 콘텐츠
const POPUP_TEXT = '시청할 수 없는 콘텐츠입니다.';

const focusState = page => page.evaluate(() => {
  const el = document.activeElement;
  return { id: el.id, tag: el.tagName };
});

async function closePopup(page) {
  for (let i = 0; i < 3; i++) {
    const b = page.getByText('닫기', { exact: true });
    if (!(await b.count()) || !(await b.first().isVisible())) return;
    await b.first().click().catch(() => {}); await page.waitForTimeout(1500);
  }
}
// 해시만 다른 goto 는 같은 문서 이동이라 화면이 다시 뜨지 않는다. 빈 문서를 거쳐 새로 연다 (TV-FOCUS.md 6장)
async function open(s, path, wait = 10000) {
  await s.page.goto('about:blank');
  await s.page.goto(base + path, { waitUntil: 'load', timeout: 90000 });
  await s.page.waitForTimeout(wait);
  await closePopup(s.page);
}
// 이 문서가 그대로인지 보려고 표시를 남긴다. 화면을 새로 읽으면 사라진다
const mark = page => page.evaluate(() => { window.__qaMark = 'keep'; });
const marked = page => page.evaluate(() => window.__qaMark === 'keep');
const hash = page => page.evaluate(() => location.hash);
const popupShown = async page => {
  const t = page.getByText(POPUP_TEXT, { exact: false });
  return (await t.count()) > 0 && (await t.first().isVisible().catch(() => false));
};
// 목록에서 제목으로 항목을 찾아 포커스 + 확인으로 연다. TV 라 클릭이 아니다
async function openItem(page, prefix, keyword) {
  const id = await page.evaluate(([p, k]) => {
    const el = [...document.querySelectorAll('[id^="' + p + '"]')]
      .find(e => (e.textContent || '').includes(k));
    return el ? el.id : null;
  }, [prefix, keyword]);
  if (!id) return null;
  await page.focus('#' + id);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(9000);
  return id;
}

(async () => {
  console.log('login ->', await ctvLogin(base, storage));
  const s = await session({ app: 'vue-app', ticket: 'CTVR-16644-fallback', title: '목록에서 연 콘텐츠 대체 이동', base, storage, viewport });
  await s.ctx.addInitScript(webosStub);

  await open(s, '/#/main');

  // ── 선행 상태 확인 ───────────────────────────────────────────────────────
  // 채널이 정말 GNB 에서 빠졌는지, 그 콘텐츠가 찜 목록에는 남아 있는지, 상세 진입이 -37019 인지.
  // 이 셋이 맞아야 아래 판정이 뜻을 가진다.
  const pre = await s.page.evaluate(async ([api, scIdx, meIdx]) => {
    const t = JSON.parse(localStorage.getItem('com.dgmonglab.rainbowtv_apptoken'));
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' };
    const get = async u => { try { return await (await fetch(u, { headers: h })).json(); } catch (e) { return { error: e.message }; } };
    const gnb = await get(api + '/api/v1/screen-channel/WEBOS');
    const list = (gnb && gnb.result && gnb.result.list) || [];
    const like = await get(api + '/api/v4/media/WEBOS/like?paging=true&page=1&size=50');
    const likes = (like && like.result && like.result.list) || [];
    // 앱이 상세를 열기 전에 부르는 것과 같은 확인(checkJavaMediaValid)
    const check = await get(api + '/api/v2/media/WEBOS/chk/' + meIdx);
    return {
      gnbCount: list.length,
      inGnb: list.some(c => c.scIdx === scIdx),
      firstChannel: list[0] && { scIdx: list[0].scIdx, scName: list[0].scName, scCode: list[0].scCode },
      inLike: likes.some(m => m.meIdx === meIdx),
      likeTitle: (likes.find(m => m.meIdx === meIdx) || {}).meName || null,
      checkCode: check && check.code,
    };
  }, [API, HIDDEN_SC, HIDDEN_ME]).catch(e => ({ error: e.message }));
  console.log('선행 상태:', JSON.stringify(pre));

  const ready = pre && pre.inGnb === false && pre.inLike === true;
  await s.check('01-precondition', {
    screen: '선행 상태 — 미노출 채널의 찜이 목록에 남아 있는지',
    expect: [],
    extra: [
      { text: `scIdx=${HIDDEN_SC} 가 GNB 에서 빠짐 (GNB ${pre.gnbCount}개)`, ok: pre.inGnb === false },
      { text: `meIdx=${HIDDEN_ME} 가 찜 목록에는 남아 있음 (${pre.likeTitle || '없음'})`, ok: pre.inLike === true },
      { text: `상세 진입 확인이 -37019 로 거절됨 (실제 ${pre.checkCode})`, ok: String(pre.checkCode) === '-37019' },
    ],
  });
  s.result.checks.at(-1).note = `${PATCH} 조회 결과: ${JSON.stringify(pre)}`;

  if (!ready) {
    s.info('02-ac5-favorite', { screen: 'AC-5 찜 화면에서 열기', note: `선행 상태가 아니어서 판정 불가: ${JSON.stringify(pre)}` });
    s.info('03-ac6-first-channel', { screen: 'AC-6 이미 첫 채널일 때', note: '선행 상태가 아니어서 판정 불가' });
    s.info('04-ac7-search', { screen: 'AC-7 다른 경로는 팝업', note: '선행 상태가 아니어서 판정 불가' });
    const r0 = await s.close();
    console.log('fallback hosts:', r0.hosts.join(', '), 'blocked:', r0.blocked.length, 'errors:', r0.errors);
    return;
  }

  const firstRoute = pre.firstChannel && pre.firstChannel.scCode === 'myrainbow' ? '#/main' : null;
  const keyword = pre.likeTitle || 'QA레CTV';

  // ── AC-5 찜 화면에서 열면 팝업 없이 첫 채널로 ────────────────────────────
  await open(s, '/#/main/favorite', 12000);
  await s.page.waitForSelector('.box-content[id^="content_"]', { timeout: 30000 }).catch(() => {});
  await mark(s.page);
  const favItem = await openItem(s.page, 'content_', keyword);
  const favPopup = await popupShown(s.page);
  const favHash = await hash(s.page);
  await s.check('02-ac5-favorite', {
    screen: 'AC-5 찜 화면에서 안 보이게 된 콘텐츠 열기',
    expect: [],
    extra: [
      { text: `목록에서 '${keyword}' 를 찾아 확인으로 열었음 (${favItem || '못 찾음'})`, ok: !!favItem },
      { text: `팝업이 뜨지 않음 ('${POPUP_TEXT}' ${favPopup ? '보임' : '없음'})`, ok: favPopup === false },
      { text: `GNB 첫 번째 스크린채널로 감 (실제 ${favHash}${firstRoute ? `, 기대 ${firstRoute}` : ''})`, ok: firstRoute ? favHash === firstRoute : /^#\/main$/.test(favHash) },
      { text: `화면을 새로 읽지 않음(같은 문서)`, ok: await marked(s.page) },
    ],
  });
  s.result.checks.at(-1).note = `${PATCH} 첫 채널: ${JSON.stringify(pre.firstChannel)}`;

  // ── AC-6 이미 첫 채널이면 이동 없이 머문다 ──────────────────────────────
  // 나의 레인보우 찜 줄(RAINBOW_BOOKMARK)에서 같은 콘텐츠를 연다. 지금 화면이 이미 첫 채널이다
  await open(s, '/#/main', 14000);
  await s.page.waitForSelector('.box-content[id^="favorite_"]', { timeout: 30000 }).catch(() => {});
  await mark(s.page);
  const beforeHash = await hash(s.page);
  const homeItem = await openItem(s.page, 'favorite_', keyword);
  const homePopup = await popupShown(s.page);
  const afterHash = await hash(s.page);
  const stillSameDoc = await marked(s.page);
  await s.page.waitForTimeout(2000);
  const focusAfter = await focusState(s.page);
  if (homeItem) {
    await s.check('03-ac6-first-channel', {
      screen: 'AC-6 이미 첫 채널일 때 나의 레인보우 찜 줄에서 열기',
      expect: [],
      extra: [
        { text: `팝업이 뜨지 않음 ('${POPUP_TEXT}' ${homePopup ? '보임' : '없음'})`, ok: homePopup === false },
        { text: `화면이 그대로 (${beforeHash} → ${afterHash})`, ok: beforeHash === afterHash },
        { text: `새로고침하지 않음(같은 문서)`, ok: stillSameDoc },
        { text: `포커스가 헤더로 돌아옴 (${focusAfter.id})`, ok: /^header_/.test(focusAfter.id || '') },
      ],
    });
    s.result.checks.at(-1).note = `${PATCH} 연 항목: ${homeItem}`;
  } else {
    s.info('03-ac6-first-channel', { screen: 'AC-6 이미 첫 채널일 때', note: `나의 레인보우 찜 줄에 '${keyword}' 가 보이지 않아 판정 불가. 찜 줄은 최근 몇 건만 보여 준다` });
  }

  // ── AC-7 다른 경로(검색)에서는 지금처럼 팝업 ────────────────────────────
  // 안 보이게 된 콘텐츠는 검색 결과에서도 빠지는 것이 기획이라(POL-SC-0003 §5·§10),
  // 찾지 못하면 그것 자체가 정상이다. 그 경우 팝업 경로는 판정하지 않고 사유를 남긴다
  await open(s, '/#/main/search', 10000);
  const found = await s.page.evaluate(async ([api, meIdx, kw]) => {
    const t = JSON.parse(localStorage.getItem('com.dgmonglab.rainbowtv_apptoken'));
    const h = { Authorization: 'Bearer ' + t };
    try {
      // 검색 화면이 제목으로 찾을 때와 같은 경로·파라미터 (searchComponent.getSearchList('meName'))
      const r = await fetch(api + '/api/v2/media/search/WEBOS?paging=true&page=1&size=20&meName=' + encodeURIComponent(kw), { headers: h });
      const j = await r.json();
      const list = (j && j.result && j.result.list) || [];
      return { code: j && j.code, n: list.length, hit: list.some(m => m.meIdx === meIdx) };
    } catch (e) { return { error: e.message }; }
  }, [API, HIDDEN_ME, keyword]).catch(e => ({ error: e.message }));
  s.info('04-ac7-search', {
    screen: 'AC-7 검색 경로에서 열면 팝업',
    note: `검색 결과에 안 보이게 된 콘텐츠가 남아 있는지 먼저 봄: ${JSON.stringify(found)}. `
      + '남아 있지 않으면(기획대로) 검색 경로로는 이 콘텐츠를 열 수 없어 팝업 회귀를 화면으로 볼 수 없다. '
      + '코드상으로는 isListPagePath 에 없는 경로이므로 팝업 분기로 간다(MediaDetailModal.handleInvalidMediaCheck).',
  });

  // ── 덤으로 AC-2 의 '미노출 채널' 쪽 ─────────────────────────────────────
  // 찜이 0건이라 분류가 없는 것과, 찜이 있는데도 채널이 안 보여 분류가 없는 것은 다른 경우다.
  // 지금은 QA레CTV 에 찜이 1건 있으면서 채널이 미노출이라, 뒤쪽을 처음으로 볼 수 있다
  await open(s, '/#/main/favorite', 12000);
  await s.page.waitForSelector('.filter-tab', { timeout: 40000 }).catch(() => {});
  await s.page.waitForTimeout(3000);
  const tabs = await s.page.$$eval('.filter-tab', els => els.map(e => (e.textContent || '').trim()));
  const hiddenName = (pre.likeTitle || '').startsWith('QA레CTV') ? 'QA레CTV' : null;
  await s.check('05-hidden-channel-tab', {
    screen: '미노출 채널은 찜이 있어도 분류를 만들지 않는다',
    expect: [],
    extra: [
      { text: `분류 목록 (${tabs.join(' > ')})`, ok: tabs.length > 0 },
      { text: `미노출 채널 '${hiddenName || HIDDEN_SC}' 분류 없음`, ok: hiddenName ? !tabs.includes(hiddenName) : true },
      { text: `찜은 남아 있는 상태에서 확인 (meIdx=${HIDDEN_ME} 찜 ${pre.inLike ? '있음' : '없음'})`, ok: pre.inLike === true },
    ],
  });
  s.result.checks.at(-1).note = `${PATCH} 찜 1건이 남아 있는데도 채널이 미노출이라 분류를 만들지 않는지 본다.`;

  const r = await s.close();
  console.log('fallback hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
