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
async function open(s, path) {
  await s.ctx.addInitScript(webosStub);
  await s.page.goto(base + path, { waitUntil: 'load', timeout: 90000 });
  await s.page.waitForTimeout(8000);
  await closePopup(s.page);
}
const tabTexts = page => page.$$eval('.filter-tab', els => els.map(e => ({ id: e.id, text: (e.textContent || '').trim() })));

(async () => {
  console.log('login ->', await ctvLogin(base, storage));
  const s = await session({ app: 'vue-app', ticket: 'CTVR-16644', title: '찜 분류에 짬짬운동 · 신규 스크린채널 추가', base, storage, viewport });
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

  let data = { channels: [] };
  for (let i = 0; i < 4; i++) {
    data = await fetchExpected();
    if ((data.channels || []).length > 0) break;
    console.log(`gnb/like 재시도 ${i + 1}:`, JSON.stringify(data).slice(0, 160));
    await s.page.waitForTimeout(3000);
  }
  console.log('gnb/like:', JSON.stringify(data));
  if (!(data.channels || []).length) {
    s.info('00-expected', { screen: '기대값 조회', note: `GNB·찜 건수 조회 실패로 분류 기대값을 만들 수 없음: ${JSON.stringify(data).slice(0, 200)}` });
  }

  await open(s, '/#/main/favorite');

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
  if (shown.length > 0) {
    const target = shown[0];
    const idx = texts.indexOf(target.scName);
    await s.page.focus(`#tab_${idx}`);
    await s.page.waitForTimeout(6000);
    await closePopup(s.page);
    const seen = await s.page.evaluate(() => document.querySelectorAll('[id^="media_"]').length);
    await s.check('02-channel-tab', {
      screen: `찜 분류 '${target.scName}' 선택`,
      expect: [],
      extra: [
        { text: `목록이 비어 있지 않음 (그려진 항목 ${seen}개, 서버 ${target.total}건)`, ok: seen > 0 },
        { text: `고른 분류가 활성(active)`, ok: await s.page.$eval(`#tab_${idx}`, el => el.classList.contains('active')).catch(() => false) },
      ],
    });
    s.result.checks.at(-1).note = `${PATCH} scIdx=${target.scIdx} 서버 총 ${target.total}건.`;
  } else {
    s.info('02-channel-tab', { screen: '찜 분류 채널 선택', note: `찜이 있는 짬짬운동·신규 채널이 없어 판정 불가. 조회 결과: ${JSON.stringify(counts)}` });
  }

  const r = await s.close();
  console.log('16644 hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
