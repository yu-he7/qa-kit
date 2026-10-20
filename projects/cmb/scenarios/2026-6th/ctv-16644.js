// 레CTV(vue-app) CTVR-16644 찜 분류에 짬짬운동 · 신규 스크린채널 추가
// QA 로컬 패치(커밋 안 함): config.js isDev=true(기본값이 운영), checkVersion webos ve='99.0'(dev 릴리즈가 3.3에 업데이트 강제)
//
// 분류는 화면 전체 문구가 아니라 탭 DOM(.wrap-tab .filter-tab)에서 읽어 판정한다.
// 찜한 콘텐츠 제목에 '클래스' 같은 낱말이 들어가면 전체 문구 대조가 잘못 맞을 수 있기 때문이다.
const { session, statePath } = require('../../../../lib/web');
const { ctvLogin, webosStub } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5102';
const storage = statePath('ctv');
const viewport = { width: 1920, height: 1080 };
const API = 'https://java-api-dev.cmbrainbowtv.co.kr';
const PATCH = 'QA 로컬 패치 2줄(dev API 지정, webOS 버전 99.0)로 실행. 커밋 안 함.';

async function closePopup(page) {
  for (let i = 0; i < 3; i++) {
    const b = page.getByText('닫기', { exact: true });
    if (!(await b.count()) || !(await b.first().isVisible())) return;
    await b.first().click().catch(() => {}); await page.waitForTimeout(1500);
  }
}
// 해시만 다른 goto 는 같은 문서 이동이라 화면이 다시 뜨지 않는다. 빈 문서를 거쳐 새로 연다 (TV-FOCUS.md 6장)
async function open(s, path) {
  await s.page.goto('about:blank');
  await s.page.goto(base + path, { waitUntil: 'load', timeout: 90000 });
  await s.page.waitForTimeout(8000);
  await closePopup(s.page);
}
const tabTexts = page => page.$$eval('.filter-tab', els => els.map(e => ({ id: e.id, text: (e.textContent || '').trim() })));

// ── 포커스 도우미 (TV-FOCUS.md 6장) ───────────────────────────────────────
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

(async () => {
  console.log('login ->', await ctvLogin(base, storage));
  const s = await session({ app: 'vue-app', ticket: 'CTVR-16644', title: '찜 분류에 짬짬운동 · 신규 스크린채널 추가', base, storage, viewport });
  await s.ctx.addInitScript(webosStub);

  // 분류를 고를 때 찜 목록 v4 에 scIdx 를 실어 보내는지 보려고 요청을 기록한다
  const reqs = [];
  await s.ctx.route('**/api/**', route => {
    const u = new URL(route.request().url());
    reqs.push({ p: u.pathname, q: u.search });
    route.continue();
  });
  const likeReqs = () => reqs.filter(r => /\/api\/v4\/media\/[^/]+\/like$/.test(r.p));

  // 라우터가 해시 방식이라 경로 앞에 #/ 를 붙인다. 안 붙이면 찜 화면이 아니라 기본 화면이 열린다
  await open(s, '/#/main');

  // GNB 스크린채널과 채널별 찜 건수를 dev API 로 직접 조회해 기대값을 만든다.
  // 찜이 0건인 채널은 분류가 없어야 하므로, 0건 여부를 모르면 '탭이 없다'가 정상인지 버그인지 가릴 수 없다.
  // 화면이 이동 중이면 fetch 가 끊겨 빈 결과가 나오므로, 채널 목록을 받을 때까지 다시 시도한다.
  const fetchExpected = () => s.page.evaluate(async (api) => {
    const t = JSON.parse(localStorage.getItem('com.dgmonglab.rainbowtv_apptoken'));
    const h = { Authorization: `Bearer ${t}` };
    const gnb = await (await fetch(`${api}/api/v1/screen-channel/WEBOS`, { headers: h })).json();
    const channels = (gnb?.result?.list || []).map(c => ({ scIdx: c.scIdx, scCode: c.scCode, scName: c.scName, mcIdx: c.mcIdx }));
    // 앱이 분류로 만드는 대상과 같은 조건(짬짬운동 + scCode 없는 신규 채널, mcIdx 있음)
    const targets = channels.filter(c => c.scIdx != null && c.mcIdx != null && (c.scCode === 'jjam' || c.scCode == null));
    const counts = [];
    for (const c of targets) {
      const r = await (await fetch(`${api}/api/v4/media/WEBOS/like?paging=true&page=1&size=1&scIdx=${c.scIdx}`, { headers: h })).json();
      counts.push({ scIdx: c.scIdx, scName: c.scName, code: r.code, total: r?.result?.page?.total ?? null });
    }
    const all = await (await fetch(`${api}/api/v4/media/WEBOS/like?paging=true&page=1&size=1`, { headers: h })).json();
    return { channels, counts, allTotal: all?.result?.page?.total ?? null };
  }, API).catch(e => ({ error: e.message }));

  // 건수가 하나라도 비면(-100 등 일시 오류) 그 채널을 0건으로도 1건 이상으로도 셀 수 없어 기대값이 틀어진다
  let data = { channels: [] };
  for (let i = 0; i < 5; i++) {
    data = await fetchExpected();
    if ((data.channels || []).length > 0 && (data.counts || []).every(c => c.total != null)) break;
    console.log(`gnb/like 재시도 ${i + 1}:`, JSON.stringify(data).slice(0, 160));
    await s.page.waitForTimeout(3000);
  }
  console.log('gnb/like:', JSON.stringify(data));
  if (!(data.channels || []).length) {
    s.info('00-expected', { screen: '기대값 조회', note: `GNB·찜 건수 조회 실패로 분류 기대값을 만들 수 없음: ${JSON.stringify(data).slice(0, 200)}` });
  }

  await open(s, '/#/main/favorite');
  // 분류는 채널마다 size=1 로 먼저 조회한 뒤에 그려진다. 고정 대기로 읽으면 0개가 나온다 (TV-FOCUS.md 6장)
  await s.page.waitForSelector('.filter-tab', { timeout: 40000 }).catch(() => {});
  await s.page.waitForTimeout(3000);

  const counts = data.counts || [];
  const shown = counts.filter(c => c.total > 0);
  const hidden = counts.filter(c => c.total === 0);
  const expectedOrder = ['전체', 'VOD', '우클'].concat(shown.map(c => c.scName), ['쇼핑']);

  const tabs = await tabTexts(s.page);
  const texts = tabs.map(t => t.text);
  console.log('tabs:', JSON.stringify(texts));

  await s.check('01-favorite-tabs', {
    screen: '찜했던 콘텐츠 분류',
    expect: [],
    extra: [
      { text: `분류 차례가 기대와 같음 (기대 ${expectedOrder.join(' > ')} / 실제 ${texts.join(' > ')})`, ok: JSON.stringify(texts) === JSON.stringify(expectedOrder) },
      { text: `쇼츠 분류 없음 (실제 ${texts.join(', ')})`, ok: !texts.some(t => t.includes('쇼~츠') || t.includes('쇼츠')) },
      { text: `'클래스' 표기를 '우클' 로 바꿈`, ok: texts.includes('우클') && !texts.includes('클래스') },
      { text: `찜 0건 채널은 분류 없음 (0건 ${hidden.map(c => `${c.scName}(${c.scIdx})`).join(', ') || '없음'})`, ok: hidden.every(c => !texts.includes(c.scName)) },
      { text: `찜 1건 이상 채널은 분류 있음 (${shown.map(c => `${c.scName}(${c.scIdx}, ${c.total}건)`).join(', ') || '없음'})`, ok: shown.every(c => texts.includes(c.scName)) },
      { text: `분류 id 가 tab_0 부터 차례로 붙음`, ok: tabs.every((t, i) => t.id === `tab_${i}`) },
    ],
  });
  s.result.checks.at(-1).note = `${PATCH} GNB·찜 건수(dev API 직접 조회): ${JSON.stringify(data)}`;

  // 채널 분류를 고르면 그 채널 찜만 나오는지. 리모컨 화면이라 클릭이 아니라 포커스로 고른다.
  const target = shown.find(c => texts.includes(c.scName));
  if (target) {
    const idx = texts.indexOf(target.scName);
    reqs.length = 0;
    await s.page.focus(`#tab_${idx}`);
    await s.page.waitForTimeout(6000);
    await closePopup(s.page);
    // 찜 화면 목록 항목 id 는 content_N[_last] 이다.
    // favorite_N 은 같은 DOM 에 함께 떠 있는 나의 레인보우 찜 줄이라 이것으로 세면 분류와 상관없는 수가 나온다
    await s.page.waitForSelector('[id^="content_"]', { timeout: 20000 }).catch(() => {});
    const seen = await s.page.evaluate(() => document.querySelectorAll('.box-content[id^="content_"]').length);
    const sent = likeReqs();
    await s.check('02-channel-tab', {
      screen: `찜 분류 '${target.scName}' 선택`,
      expect: [],
      extra: [
        { text: `목록이 비어 있지 않음 (그려진 항목 ${seen}개, 서버 ${target.total}건)`, ok: seen > 0 },
        { text: `그린 항목 수가 서버 건수와 같음`, ok: seen === target.total },
        { text: `고른 분류가 활성(active)`, ok: await s.page.$eval(`#tab_${idx}`, el => el.classList.contains('active')).catch(() => false) },
        { text: `찜 목록 조회에 scIdx=${target.scIdx} 를 실어 보냄 (${sent.map(r => r.q).join(' ') || '요청 없음'})`, ok: sent.some(r => new URLSearchParams(r.q).get('scIdx') === String(target.scIdx)) },
      ],
    });
    s.result.checks.at(-1).note = `${PATCH} scIdx=${target.scIdx} 서버 총 ${target.total}건. 부른 요청: ${JSON.stringify(sent)}`;

    // AC-4 분류 ↔ 목록 포커스. 분류가 6개로 늘어난 뒤에도 번호가 어긋나지 않는지 본다.
    // 리모컨 이동은 vuex(remoteFocus)가 기억하는 현재 id 로 움직인다. page.focus() 로 DOM 포커스만 옮기면
    // 그 기억이 바뀌지 않아 키가 엉뚱하게 움직인다. 시작 위치도 키로 맞춘다 (TV-FOCUS.md 6장)
    await open(s, '/#/main/favorite');
    const start = await focusState(s.page);
    // 한 바퀴 넉넉히 돈다. 화면이 준비되기 전에 들어간 첫 입력은 먹힐 수 있어 횟수로 위치를 가정하지 않는다
    const round = await press(s.page, 'ArrowRight', texts.length + 2, 1800);
    const visited = [start.id].concat(round.map(f => f.id));
    await s.check('03-tab-focus', {
      screen: `분류 ${texts.length}개 좌우 이동`,
      expect: [],
      extra: [
        { text: `화면에 들어오면 분류에 포커스가 있음 (${start.id})`, ok: /^tab_/.test(start.id || '') },
        focusOk(`분류 오른쪽 ${texts.length + 2}회`, round),
        { text: `분류 ${texts.length}개를 빠짐없이 지남 (${visited.join(' → ')})`, ok: texts.every((_, i) => visited.includes(`tab_${i}`)) },
        { text: `끝에서 더 눌러도 분류 밖으로 나가지 않음`, ok: round.every(f => /^tab_/.test(f.id || '')) },
      ],
    });
    s.result.checks.at(-1).note = `${PATCH} 분류 ${texts.length}개(${texts.join(' > ')}) 상태에서 확인. 마지막 분류에서 첫 분류로 도는 것은 레CTV 다른 탭 화면(선물함·OTT)과 같은 기존 동작이다.`;

    // 찜이 있는 채널 분류에서 목록으로 내려갔다 올라온다. 빈 분류에서 내려가면 갈 곳이 없어 판정이 안 된다
    await open(s, '/#/main/favorite');
    const hop = [];
    for (let i = 0; i < texts.length + 2; i++) {
      const now = await focusState(s.page);
      if (now.id === `tab_${idx}`) break;
      await s.page.keyboard.press('ArrowRight');
      await s.page.waitForTimeout(1800);
      hop.push(now.id);
    }
    const onTarget = await focusState(s.page);
    await s.page.waitForSelector('.box-content[id^="content_"]', { timeout: 30000 }).catch(() => {});
    await s.page.waitForTimeout(2000);
    const down = await press(s.page, 'ArrowDown', 1, 3000);
    const up = await press(s.page, 'ArrowUp', 1, 3000);
    await s.check('04-tab-list-focus', {
      screen: `찜 분류 '${target.scName}' 과 목록 오가기`,
      expect: [],
      extra: [
        { text: `'${target.scName}' 분류까지 키로 이동함 (${onTarget.id})`, ok: onTarget.id === `tab_${idx}` },
        focusOk('목록으로 내려감', down),
        { text: `아래로 내려가면 목록 항목으로 간다 (${down.at(-1).id})`, ok: /^content_/.test(down.at(-1).id || '') },
        focusOk('분류로 되돌아옴', up),
        { text: `위로 올라오면 분류로 돌아온다 (${up.at(-1).id})`, ok: /^tab_/.test(up.at(-1).id || '') },
      ],
    });
    s.result.checks.at(-1).note = `${PATCH} 지나온 분류: ${hop.join(' → ')} → ${onTarget.id}`;

    // 찜이 0건인 분류에서 아래로 내리면 갈 곳이 없다. 포커스가 사라지면 다음 키가 어디로 갈지 알 수 없다 (TV-FOCUS.md 2장)
    const emptyIdx = texts.length - 1;   // 쇼핑. 기본 분류라 건수와 상관없이 항상 그려진다
    await open(s, '/#/main/favorite');
    for (let i = 0; i < texts.length + 2; i++) {
      const now = await focusState(s.page);
      if (now.id === `tab_${emptyIdx}`) break;
      await s.page.keyboard.press('ArrowRight');
      await s.page.waitForTimeout(1800);
    }
    const onEmpty = await focusState(s.page);
    const emptyCount = await s.page.evaluate(() => document.querySelectorAll('.box-content[id^="content_"]').length);
    const emptyDown = await press(s.page, 'ArrowDown', 2, 2500);
    await s.check('05-empty-tab-focus', {
      screen: `빈 분류('${texts[emptyIdx]}')에서 아래로 이동`,
      expect: [],
      extra: [
        { text: `빈 분류에 서 있음 (${onEmpty.id}, 그려진 항목 ${emptyCount}개)`, ok: onEmpty.id === `tab_${emptyIdx}` && emptyCount === 0 },
        focusOk('아래로 2회', emptyDown),
      ],
    });
    s.result.checks.at(-1).note = `${PATCH} 목록이 비어 아래로 갈 곳이 없을 때 포커스가 남아 있는지 본다.`;
  } else {
    s.info('02-channel-tab', { screen: '찜 분류 채널 선택', note: `찜이 있는 짬짬운동·신규 채널이 없어 판정 불가. 조회 결과: ${JSON.stringify(counts)}` });
    s.info('03-tab-focus', { screen: '분류 좌우 이동', note: '채널 분류가 그려지지 않아 분류가 늘어난 상태의 포커스를 볼 수 없음' });
    s.info('04-tab-list-focus', { screen: '분류와 목록 오가기', note: '찜이 있는 채널 분류가 없어 목록으로 내려가는 포커스를 볼 수 없음' });
  }

  // AC-5·AC-6·AC-7 대체 이동. 안 보이게 된 콘텐츠가 목록에 남아 있어야 판정할 수 있다.
  s.info('05-fallback', {
    screen: '목록에서 연 콘텐츠 대체 이동',
    note: '미실행 — 스크린채널·앱 메뉴 미노출로 목록에만 남은 콘텐츠(상세 진입 확인이 -37019 로 떨어지는 찜)가 dev 계정에 없어 판정 불가. '
      + '채널 하나를 미노출로 바꾸고 그 채널 콘텐츠를 찜해 두면 AC-5(팝업 없이 이동)·AC-6(이미 첫 채널이면 머무름)·AC-7(검색·추천 경로는 팝업 유지)을 한 번에 볼 수 있다.',
  });

  const r = await s.close();
  console.log('16644 hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
