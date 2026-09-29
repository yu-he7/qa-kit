// 레CTV(vue-app) CTVR-16164 우클 시청중인 클래스 구역 삭제 · CTVR-16167 쇼핑 코인몰 → 코인보석함
// QA 로컬 패치(커밋 안 함): config.js isDev=true(기본값이 운영), checkVersion webos ve='99.0'(dev 릴리즈가 3.3에 업데이트 강제)
const { session, statePath } = require('../../../../lib/web');
const { ctvLogin, webosStub } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5102';
const storage = statePath('ctv');
const viewport = { width: 1920, height: 1080 };
const PATCH = 'QA 로컬 패치 2줄(dev API 지정, webOS 버전 99.0)로 실행. 커밋 안 함.';

async function open(s) {
  await s.ctx.addInitScript(webosStub);
  await s.page.goto(base + '/', { waitUntil: 'load', timeout: 90000 }); await s.page.waitForTimeout(7000);
  await closePopup(s.page);
}
async function closePopup(page) {
  for (let i = 0; i < 3; i++) {
    const b = page.getByText('닫기', { exact: true });
    if (!(await b.count()) || !(await b.first().isVisible())) return;
    await b.first().click().catch(() => {}); await page.waitForTimeout(1500);
  }
}
async function menu(page, id) { await page.focus(id); await page.waitForTimeout(6000); await closePopup(page); }
async function scroll(page, n) { for (let i = 0; i < n; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(1200); } }

(async () => {
  console.log('login ->', await ctvLogin(base, storage));
  // CTVR-16164
  let s = await session({ app: 'vue-app', ticket: 'CTVR-16164', title: '우리동네 클래스 화면 시청중인 클래스 구역 삭제', base, storage, viewport });
  await open(s);
  await menu(s.page, '#header_vod');
  await s.check('01-vod-contrast', { screen: "대조군: VOD 화면 '시청중인 VOD' 구역(유지되어야 함)", expect: ['님이 시청중인 VOD'] });
  s.result.checks.at(-1).note = '대조군. 다른 화면의 시청중인 구역은 그대로 유지됨.';
  // 계정에 실제 클래스 시청 이력이 있는지 dev API로 직접 확인(이력이 있어야 '구역 없음'이 의미 있음)
  const hist = await s.page.evaluate(async () => {
    const t = JSON.parse(localStorage.getItem('com.dgmonglab.rainbowtv_apptoken'));
    const r = await fetch('https://java-api-dev.cmbrainbowtv.co.kr/api/v1/media/WEBOS/history/continue?paging=true&size=7&props=idx&dirs=desc&mcType=CLASS', { headers: { Authorization: `Bearer ${t}` } });
    const j = await r.json(); const d = j?.result?.data ?? j?.result ?? {};
    const list = Array.isArray(d) ? d : (d.list || d.content || []);
    return { code: j.code, count: list.length, titles: list.slice(0, 3).map(x => x.title || x.mcTitle || x.name).filter(Boolean) };
  }).catch(e => ({ error: e.message }));
  console.log('class history:', JSON.stringify(hist));
  await menu(s.page, '#header_class');
  await s.check('02-class-top', { screen: '우리동네클래스 화면 상단', expect: [], absent: ['님이 시청중인 클래스', '님이 시청중인'] });
  s.result.checks.at(-1).note = `${PATCH} 계정의 클래스 시청 이력(dev API 직접 조회): ${JSON.stringify(hist)}`;
  for (let i = 1; i <= 3; i++) {
    await scroll(s.page, 2);
    await s.check(`0${i + 2}-class-down${i}`, { screen: `우리동네클래스 화면 아래로 ${i}`, absent: ['님이 시청중인 클래스', '님이 시청중인'] });
  }
  let r = await s.close();
  console.log('16164 hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);

  // CTVR-16167
  s = await session({ app: 'vue-app', ticket: 'CTVR-16167', title: '쇼핑 화면 코인몰 명칭을 코인보석함으로 변경', base, storage, viewport });
  await open(s);
  await menu(s.page, '#header_shop');
  await s.check('01-shopping-tab', { screen: '쇼핑 화면 탭', expect: ['코인보석함'], absent: ['코인몰'] });
  s.result.checks.at(-1).note = PATCH;
  await s.page.focus('#shopBtn_2'); await s.page.waitForTimeout(4000); await closePopup(s.page);
  await s.page.getByText('코인보석함은 모바일에서 확인해주세요!').first().scrollIntoViewIfNeeded().catch(e => console.log('scroll:', e.message.split('\n')[0]));
  await s.page.waitForTimeout(1500);
  await s.check('02-coin-guide', { screen: '쇼핑 > 코인보석함 탭 안내', expect: ['코인보석함은 모바일에서 확인해주세요!'], absent: ['코인몰'] });
  r = await s.close();
  console.log('16167 hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
