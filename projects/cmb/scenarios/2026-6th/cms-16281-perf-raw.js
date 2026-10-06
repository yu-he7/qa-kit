// 준비: dev 에 2026-08 합성 데이터(콘텐츠 1만·사건 3만 건)를 적재한 상태에서만 의미가 있다. 끝나면 합성 데이터를 정리한다.
// 통계 분석 RAW 다운로드 성능(8/1~8/30 합성 사건 3만 건): 콘텐츠·채널메뉴 각각
const path = require('path'); const fs = require('fs'); const zlib = require('zlib');
const { session, statePath, Q } = require('../../../../lib/web');
const { adminLogin } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5103';
(async () => {
  await adminLogin(base, process.env.STATE || statePath('cms'));
  const s = await session({ app: 'vue-cms', ticket: 'CTVR-16281-perf-raw', title: '통계 분석 RAW 다운로드 성능(30일 사건 3만 건)', base, storage: process.env.STATE || statePath('cms'), viewport: { width: 1600, height: 1000 } });
  const { page, shot } = s; const out = [];
  for (const [url, name] of [['/stats/analysis/contents', '콘텐츠'], ['/stats/analysis/channel-menus', '채널메뉴']]) {
    const times = []; const h = async req => { if (!/excel\/.*raw/.test(req.url())) return; const t = req.timing(); const r = await req.response(); times.push({ status: r && r.status(), ms: Math.round(t.responseEnd) }); };
    page.on('requestfinished', h);
    await page.goto(base + url, { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(4000);
    for (const [ph, v] of [['시작일', '2026-08-01'], ['종료일', '2026-08-30']]) { const i = page.locator(`.box-common input[placeholder="${ph}"]`).first(); await i.click(); await i.fill(v); await i.press('Enter'); await page.mouse.click(5, 5); }
    await page.getByRole('button', { name: 'RAW 데이터 엑셀로 내려받기' }).click(); await page.waitForTimeout(1200);
    await page.locator('.vfm__content', { hasText: '다운로드 기간 입력' }).getByRole('button', { name: '다음' }).click(); await page.waitForTimeout(1200);
    await page.locator('input[placeholder="사유 입력"]').fill('QA 성능 테스트(RAW 3만 건)');
    const t0 = Date.now();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.locator('.vfm__content button.btn-blue', { hasText: '확인' }).last().click()]);
    const file = path.join(Q, 'downloads', 'vue-cms', dl.suggestedFilename()); await dl.saveAs(file);
    const wall = Date.now() - t0; await page.waitForTimeout(1500);
    const r = { name, wall, size: fs.statSync(file).size, file: path.basename(file), server: times };
    await shot(`${name}-raw-done`, { screen: `${name} RAW 8/1~8/30 다운로드 완료`, note: JSON.stringify(r) });
    out.push(r); page.off('requestfinished', h);
  }
  s.result.timings = out; await s.close(); console.log(JSON.stringify(out));
})().catch(e => { console.error('FAILED', e.message.split('\n')[0]); process.exit(1); });
