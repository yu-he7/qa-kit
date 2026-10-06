// 준비: dev 에 2026-08 합성 데이터(콘텐츠 1만·사건 3만 건)를 적재한 상태에서만 의미가 있다. 끝나면 합성 데이터를 정리한다.
// 통계 분석 엑셀(1만 행) 응답 시간
const path = require('path'); const fs = require('fs');
const { session, statePath, Q } = require('../../../../lib/web');
const { adminLogin } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5103';
(async () => {
  await adminLogin(base, process.env.STATE || statePath('cms'));
  const s = await session({ app: 'vue-cms', ticket: 'CTVR-16281-perf-excel', title: '통계 분석 엑셀 다운로드 성능(30일 1만 행)', base, storage: process.env.STATE || statePath('cms'), viewport: { width: 1600, height: 1000 } });
  const { page, shot, result } = s; const times = [];
  page.on('requestfinished', async req => { if (!/bf-analyses\/excel/.test(req.url())) return; const t = req.timing(); const r = await req.response(); times.push({ path: req.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 140), status: r && r.status(), ms: Math.round(t.responseEnd) }); });
  await page.goto(base + '/stats/analysis/contents', { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(4000);
  for (const [ph, v] of [['시작일', '2026-08-01'], ['종료일', '2026-08-30']]) { const i = page.locator(`.box-common input[placeholder="${ph}"]`).first(); await i.click(); await i.fill(v); await i.press('Enter'); await page.mouse.click(5, 5); }
  await page.getByRole('button', { name: '조회', exact: true }).click(); await page.waitForTimeout(3000);
  await page.getByRole('button', { name: '엑셀 다운로드' }).click(); await page.waitForTimeout(1000);
  await page.locator('input[placeholder="사유 입력"]').fill('QA 성능 테스트(1만 행)');
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('.vfm__content button.btn-blue', { hasText: '확인' }).last().click()]);
  const file = path.join(Q, 'downloads', 'vue-cms', dl.suggestedFilename()); await dl.saveAs(file);
  const wall = Date.now() - t0; await page.waitForTimeout(1000);
  await shot('excel-done', { screen: '엑셀 1만 행 다운로드 완료', note: `클릭→파일 ${wall} ms · ${fs.statSync(file).size} bytes · ${JSON.stringify(times)}` });
  result.timings = times; await s.close();
  console.log('wall', wall, 'ms', file, fs.statSync(file).size, JSON.stringify(times));
})().catch(e => { console.error('FAILED', e); process.exit(1); });
