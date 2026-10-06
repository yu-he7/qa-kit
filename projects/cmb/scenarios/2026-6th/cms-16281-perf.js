// 준비: dev 에 2026-08 합성 데이터(콘텐츠 1만·사건 3만 건)를 적재한 상태에서만 의미가 있다. 끝나면 합성 데이터를 정리한다.
// 통계 분석 목록 API 성능: 8월 합성 1만 행(콘텐츠 1만 개, 사건 3만 건)으로 화면 조회 시 dev stats API 응답 시간을 잰다
const { session, statePath } = require('../../../../lib/web');
const { adminLogin } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5103';
const storage = process.env.STATE || statePath('cms');
const RUNS = 5;
(async () => {
  await adminLogin(base, process.env.STATE || statePath('cms'));
  const s = await session({ app: 'vue-cms', ticket: 'CTVR-16281-perf', title: '통계 분석 목록 API 성능(30일 1만 행)', base, storage, viewport: { width: 1600, height: 1000 } });
  const { page, shot, result } = s;
  const times = [];
  page.on('requestfinished', async req => {
    const u = req.url(); if (!/bf-analyses\/(contents|channel-menus)(\?|$)|bf-analyses\/excel/.test(u)) return;
    const t = req.timing(); const resp = await req.response();
    times.push({ path: u.replace(/^https?:\/\/[^/]+/, '').slice(0, 160), status: resp && resp.status(), ms: Math.round(t.responseEnd), ttfb: Math.round(t.responseStart) });
  });
  const setPeriod = async () => {
    for (const [ph, v] of [['시작일', '2026-08-01'], ['종료일', '2026-08-30']]) {
      const i = page.locator(`.box-common input[placeholder="${ph}"]`).first(); await i.click(); await i.fill(v); await i.press('Enter'); await page.mouse.click(5, 5); await page.waitForTimeout(300);
    }
  };
  const search = async () => { const n = times.length; await page.getByRole('button', { name: '조회', exact: true }).click(); for (let i = 0; i < 240 && times.length === n; i++) await page.waitForTimeout(250); await page.waitForTimeout(800); return times.at(-1); };
  const total = async () => (await page.locator('.hits').innerText().catch(() => '')).trim();
  const label = (i, x) => { result.checks.at(-1).note = `${x.ms} ms (TTFB ${x.ttfb} ms) · ${x.status} · ${x.path}`; };
  for (const [url, name] of [['/stats/analysis/contents', '콘텐츠 분석'], ['/stats/analysis/channel-menus', '채널메뉴 분석']]) {
    await page.goto(base + url, { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(4000);
    await setPeriod();
    for (let i = 1; i <= RUNS; i++) { const x = await search(); console.log(name, '조회', i, x.ms, 'ms', x.status, await total()); }
    await shot(`${name}-search`, { screen: `${name} 8/1~8/30 전체 조회 (${await total()})` }); label(0, times.at(-1));
    // 마지막 쪽
    const last = await page.locator('.el-pager li.number').last().innerText().catch(() => '');
    if (last && last !== '1') { const n = times.length; await page.locator('.el-pager li.number').last().click(); for (let i = 0; i < 240 && times.length === n; i++) await page.waitForTimeout(250); await page.waitForTimeout(800);
      console.log(name, '마지막 쪽', last, times.at(-1).ms, 'ms'); await shot(`${name}-last`, { screen: `${name} 마지막 쪽(${last})` }); label(0, times.at(-1)); }
    // 플랫폼 필터
    await page.locator('.box-row', { hasText: '플랫폼' }).locator('.el-select').click(); await page.waitForTimeout(500);
    await page.locator('.el-select-dropdown__item:visible').nth(1).click(); await page.waitForTimeout(300);
    const f = await search(); console.log(name, '플랫폼 필터', f.ms, 'ms', await total());
    await shot(`${name}-platform`, { screen: `${name} 플랫폼 필터 (${await total()})` }); label(0, f);
  }
  result.timings = times;
  const r = await s.close();
  console.log(JSON.stringify(times));
  console.log('errors', r.errors);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
