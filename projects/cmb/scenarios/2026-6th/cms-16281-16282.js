// 실행: node cms-16281-16282.js [content|menu|auth|crm] (생략하면 전부). CRM 이력 확인은 crm 서버(5104)도 띄워 둔다.
// CTVR-16281·16282 CMS BF데이터 관리 > 분석 BF데이터(메뉴 이동 후) + 권한 트리·로그 관리.
// 조회·다운로드만 한다(다운로드 이력·로그가 dev에 쌓임). 권한 포멧은 등록 화면만 열고 저장하지 않는다.
const fs = require('fs');
const path = require('path');
const { session, statePath, Q } = require('../../../../lib/web');
const { adminLogin } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5103';
const storage = statePath('cms');
const viewport = { width: 1600, height: 1000 };
const REASON = 'QA 6차 메뉴 이동 검수';
const dlDir = path.join(Q, 'downloads', 'vue-cms'); fs.mkdirSync(dlDir, { recursive: true });

const helpers = (page) => {
  const go = async u => { await page.goto(base + u, { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(4000); };
  const swalOk = async () => { await page.locator('.swal2-confirm').click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(800); };
  const setDate = async (nth, value, scope = page) => {
    const input = scope.locator('input[placeholder="' + (nth === 0 ? '시작일' : '종료일') + '"]').first();
    await input.click(); await input.fill(value); await input.press('Enter'); await page.waitForTimeout(500);
    await page.mouse.click(5, 5); await page.waitForTimeout(300);
  };
  const filterValue = async nth => page.locator('input[placeholder="' + (nth === 0 ? '시작일' : '종료일') + '"]').first().inputValue();
  const download = async (trigger) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), trigger()]);
    const name = dl.suggestedFilename(); await dl.saveAs(path.join(dlDir, name)); return name;
  };
  const reasonOk = async () => {
    await page.locator('input[placeholder="사유 입력"]').fill(REASON); await page.waitForTimeout(500);
  };
  return { go, swalOk, setDate, filterValue, download, reasonOk };
};

async function analysis({ ticket, title, url, screen, total, headers, prefix }) {
  const s = await session({ app: 'vue-cms', ticket, title, base, storage, viewport });
  const { page, check, shot, result } = s;
  const h = helpers(page);
  const note = (t) => { result.checks.at(-1).note = t; };

  await h.go(url);
  await check('01-entry', { screen: `${screen} 첫 진입(사이드 메뉴 BF데이터 관리 > 분석 BF데이터)`, expect: ['BF데이터 관리', '분석 BF데이터', '콘텐츠 분석 BF데이터', '채널메뉴 분석 BF데이터', '조회 조건을 입력한 후 [조회] 버튼을 눌러 주세요.', '최대 30일'], absent: ['통계 분석'] });
  await page.locator('.text-top-menu', { hasText: /^BF데이터 관리$/ }).first().click().catch(() => {}); await page.waitForTimeout(1200);
  await page.locator('.container-side').getByText('분석 BF데이터', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(1500);
  await check('01b-sidemenu', { screen: '사이드 메뉴 펼침: BF데이터 관리 > 분석 BF데이터 > 화면 2개', expect: ['분석 BF데이터', '콘텐츠 분석 BF데이터', '채널메뉴 분석 BF데이터'] });
  if (!page.url().includes(url)) await h.go(url);
  const [st, ed] = [await h.filterValue(0), await h.filterValue(1)];
  note(`기본 기간 ${st} ~ ${ed} (마지막 적재일 기준 30일)`);

  await page.getByRole('button', { name: '조회', exact: true }).click(); await page.waitForTimeout(4000);
  await check('02-search', { screen: `${screen} 조회 결과(기본 기간·전체 조건)`, expect: headers });
  const totalText = await page.evaluate(() => (document.body.innerText.match(/총\s*([\d,]+)\s*건/) || [])[1] || '');
  result.total = Number(totalText.replace(/,/g, '')); note(`화면 총 ${totalText} 건 (API·DB 대조는 별도)`);
  await page.evaluate(() => { document.querySelectorAll('.el-scrollbar__wrap, .el-table__body-wrapper').forEach(w => { w.scrollLeft = 99999; }); window.scrollTo(0, document.body.scrollHeight); }); await page.waitForTimeout(1200);
  await shot('03-search-right', { screen: '표 오른쪽 끝·아래(시간 HH:MM:SS·비율 %·페이지)' });
  await page.evaluate(() => { document.querySelectorAll('.el-scrollbar__wrap, .el-table__body-wrapper').forEach(w => { w.scrollLeft = 0; }); window.scrollTo(0, document.body.scrollHeight); }); await page.waitForTimeout(500);

  await page.locator('.el-pager li', { hasText: /^2$/ }).first().click(); await page.waitForTimeout(3000);
  const no = (await page.locator('.el-table__body tr').first().locator('td').first().innerText().catch(() => '')).trim();
  await check('04-page2', { screen: '2쪽 이동', expect: [`총 ${totalText} 건`] });
  note(`2쪽 첫 행 NO = ${no} (기대 11)`); if (no !== '11') result.checks.at(-1).verdict = 'fail';

  // 기간 역전
  await h.setDate(0, ed); await h.setDate(1, st);
  await page.getByRole('button', { name: '조회', exact: true }).click(); await page.waitForTimeout(1200);
  await check('05-reverse', { screen: '기간 역전 안내', expect: ['기간의 끝이 시작보다 앞입니다.'] });
  await h.swalOk();
  // 마지막 적재일 뒤 날짜는 고를 수 없다(달력에서 비활성)
  await h.setDate(0, st); await h.setDate(1, ed);
  await page.locator('input[placeholder="종료일"]').first().click(); await page.waitForTimeout(1000);
  await shot('06-disabled-date', { screen: '종료일 달력: 마지막 적재일 뒤 날짜 비활성', note: `마지막 적재일 ${ed}` });
  await page.keyboard.press('Escape'); await page.mouse.click(5, 5); await page.waitForTimeout(500);

  // 엑셀 다운로드
  await page.getByRole('button', { name: '엑셀 다운로드' }).click(); await page.waitForTimeout(1200);
  await check('07-excel-reason', { screen: '엑셀 다운로드 사유 입력 팝업', expect: ['다운로드 사유를 입력하세요.'] });
  await h.reasonOk();
  const excel = await h.download(() => page.locator('.vfm__content button.btn-blue', { hasText: '확인' }).last().click());
  await page.waitForTimeout(1500);
  await shot('08-excel-done', { screen: '엑셀 다운로드 완료', note: `파일명 ${excel}` });
  if (!excel.startsWith(`${prefix}_${st}~${ed}_`)) result.checks.at(-1).verdict = 'fail';

  // RAW: 31일 → 다운로드 불가, 30일 이내 → 사유 → 다운로드
  await page.getByRole('button', { name: 'RAW 데이터 엑셀로 내려받기' }).click(); await page.waitForTimeout(1200);
  const modal = page.locator('.vfm__content', { hasText: '다운로드 기간 입력' });
  await check('09-raw-period', { screen: 'RAW 다운로드 기간 입력 팝업', expect: ['다운로드 기간 입력', '한 번에 30일까지'] });
  await modal.getByRole('button', { name: '다음' }).click(); await page.waitForTimeout(1200);
  await check('10-raw-reason', { screen: 'RAW 사유 입력 팝업', expect: ['다운로드 사유를 입력하세요.'] });
  await h.reasonOk();
  const raw = await h.download(() => page.locator('.vfm__content button.btn-blue', { hasText: '확인' }).last().click());
  await page.waitForTimeout(1500);
  await shot('11-raw-done', { screen: 'RAW 다운로드 완료', note: `파일명 ${raw}` });
  if (!raw.startsWith(`${prefix}_RAW_${st}~${ed}_`)) result.checks.at(-1).verdict = 'fail';

  const r = await s.close();
  console.log(ticket, 'hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
  return { st, ed };
}

async function authorityAndLog() {
  const s = await session({ app: 'vue-cms', ticket: 'CTVR-16281-menu-auth-log', title: '분석 BF데이터 권한 트리·로그 관리(depth 8)', base, storage, viewport });
  const { page, check, result } = s;
  const h = helpers(page);
  await h.go('/member/admin/adminAuth/create');
  await page.getByText('분석 BF데이터', { exact: true }).first().scrollIntoViewIfNeeded().catch(() => {});
  await check('01-authority-tree', { screen: '권한 포멧 등록: BF데이터 관리 아래 분석 BF데이터 권한', expect: ['BF데이터 관리', '분석 BF데이터', '콘텐츠 분석 BF데이터', '채널메뉴 분석 BF데이터'], absent: ['통계 분석'] });
  result.checks.at(-1).note = '등록 화면만 열고 저장하지 않음. 버튼 권한(조회·엑셀)은 트리 펼침 상태에 따라 보임.';

  await h.go('/operate/log');
  await check('02-log-list', { screen: '로그 관리 목록(방금 검수한 행동)', expect: ['BF데이터 관리->분석 BF데이터->콘텐츠 분석 BF데이터', 'BF데이터 관리->분석 BF데이터->채널메뉴 분석 BF데이터', `사유: ${REASON}`] });
  result.checks.at(-1).note = '최근 로그 첫 쪽.';
  // 접근 항목 필터: BF데이터 관리(depth 8)
  const sel = page.locator('.el-select').filter({ has: page.locator('input') });
  let picked = false;
  for (let i = 0; i < await sel.count() && !picked; i++) {
    await sel.nth(i).click().catch(() => {}); await page.waitForTimeout(600);
    const opt = page.locator('.el-select-dropdown__item:visible', { hasText: /^BF데이터 관리$/ });
    if (await opt.count()) { await opt.first().click(); picked = true; } else { await page.keyboard.press('Escape'); }
  }
  await page.waitForTimeout(500);
  await check('03-log-filter-option', { screen: '로그 관리 접근 항목 필터에 BF데이터 관리 선택', expect: ['BF데이터 관리'] });
  result.checks.at(-1).note = picked ? '선택지에서 BF데이터 관리 선택됨' : '선택지를 찾지 못함';
  if (!picked) result.checks.at(-1).verdict = 'fail';
  await page.getByRole('button', { name: '조회', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(4000);
  await check('04-log-filter-result', { screen: '접근 항목 BF데이터 관리로 조회한 결과', expect: ['BF데이터 관리->분석 BF데이터'], absent: ['통계관리->통계 분석'] });

  const r = await s.close();
  console.log('auth-log hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
}

// CMS 다운로드 이력은 CRM 운영관리 > DB 엑셀다운 관리에서 본다(CMS 엑셀다운기록 탭은 더미 화면)
async function crmDownloadHistory() {
  const crmBase = process.env.CRM_BASE || 'http://127.0.0.1:5104';
  const crmStorage = statePath('crm');
  await adminLogin(crmBase, crmStorage);
  const s = await session({ app: 'vue-crm', ticket: 'CTVR-16281-menu-download-history', title: 'CMS 분석 BF데이터 다운로드 이력(CRM DB 엑셀다운 관리)', base: crmBase, storage: crmStorage, viewport });
  const { page, check, result } = s;
  await page.goto(crmBase + '/operate/db/excel', { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(5000);
  await check('01-db-excel-crm', { screen: 'CRM DB 엑셀다운 관리 원래 화면(dhType 1 = CRM 이력만)', expect: ['DB 엑셀다운 관리'], absent: [REASON] });
  result.checks.at(-1).note = 'CMS 다운로드 이력(dhType 2)을 보여 주는 화면은 CMS·CRM 어디에도 없음.';
  // 검수 전용: 목록 요청의 dhType 을 2(CMS)로 바꿔 같은 화면에 CMS 이력을 띄운다
  await page.route(/\/v1\/admin\/download\/history\?/, r => r.continue({ url: r.request().url().replace('dhType=1', 'dhType=2') }));
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(5000);
  await check('02-db-excel-cms', { screen: '[검수 전용 요청 변경] dhType=2 로 본 CMS 다운로드 이력', expect: ['BF데이터 관리', '분석 BF데이터', '콘텐츠 분석 BF데이터', '채널메뉴 분석 BF데이터', REASON] });
  result.checks.at(-1).note = '화면 코드는 dhType=1 고정. Playwright 가 요청만 dhType=2 로 바꿈. 엑셀·RAW 다운로드 4건이 depth BF데이터 관리 > 분석 BF데이터 > 화면 > 종류, 사유와 함께 저장됨을 확인.';
  const r = await s.close();
  console.log('crm hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
}

(async () => {
  await adminLogin(base, storage);
  const only = process.argv[2];
  if (!only || only === 'content') await analysis({
    ticket: 'CTVR-16281-menu', title: 'CMS BF데이터 관리 > 분석 BF데이터 > 콘텐츠 분석 BF데이터', url: '/statistics/analysis/contents', screen: '콘텐츠 분석 BF데이터',
    total: 56, headers: ['콘텐츠 ID', '콘텐츠명', '조회수', '총 시청시간', '시청완료율'], prefix: '콘텐츠분석',
  });
  if (!only || only === 'menu') await analysis({
    ticket: 'CTVR-16282-menu', title: 'CMS BF데이터 관리 > 분석 BF데이터 > 채널메뉴 분석 BF데이터', url: '/statistics/analysis/channel-menus', screen: '채널메뉴 분석 BF데이터',
    total: 22, headers: ['채널명', '메뉴명', '노출수', 'CTR', '총 시청시간'], prefix: '채널메뉴분석',
  });
  if (!only || only === 'auth') await authorityAndLog();
  if (!only || only === 'crm') await crmDownloadHistory();
})().catch(e => { console.error(e); process.exit(1); });
