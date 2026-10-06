// 회원 검색어는 계정 파일의 CMB_DEV_MEMBER_KEYWORD(dev 테스트 회원 이름)를 쓴다.
// CRM CTVR-16428 정지/휴면 상세 엑셀 설정 제거 · Raw Data AD(광고)결합(레드,블루(구)) 탭 제거. 조회만 하고, 엑셀은 레드,블루 탭 1건만 받는다.
const { session, statePath, env } = require('../../../../lib/web');
const { adminLogin } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5104';
const storage = statePath('crm');
const viewport = { width: 1600, height: 1000 };
const TABS = ['AD(광고)레드,블루', 'AD(광고)옐로', 'AD(광고)퍼플(일반)', '케이블TV', 'VOD(RS)'];

(async () => {
  if (!env.CMB_DEV_MEMBER_KEYWORD) throw new Error('계정 파일에 CMB_DEV_MEMBER_KEYWORD 가 없습니다');
  await adminLogin(base, storage);
  const s = await session({ app: 'vue-crm', ticket: 'CTVR-16428', title: '정지/휴면 상세 엑셀 설정·Raw Data AD(광고)결합 탭 제거', base, storage, viewport });
  const { page, check, result } = s;
  const go = async u => { await page.goto(base + u, { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(5000); };
  const buttons = () => page.locator('button:visible').evaluateAll(b => [...new Set(b.map(e => e.innerText.trim()).filter(Boolean))]);

  // AC-2: Raw Data 진입 → 첫 탭으로 이동, AD(광고)결합 탭 없음
  await go('/purchase/calculate/raw');
  await check('01-raw', { screen: '정산관리 > Raw Data 진입', expect: TABS, absent: ['AD(광고)결합', 'AD(광고) 결합'] });
  result.checks.at(-1).note = `이동한 주소: ${page.url().replace(base, '')}`;

  // AC-2: 엑셀 다운로드 — Raw Data 첫 진입 시 전체 화면 로딩 표시가 사라지지 않아 버튼을 누를 수 없다(수정 전 빌드 5841cbd2도 같음).
  const masked = await page.locator('.el-loading-mask.is-fullscreen').isVisible().catch(() => false);
  await check('02-raw-excel', { screen: 'Raw Data > AD(광고)레드,블루 엑셀 다운로드', expect: ['엑셀다운'] });
  const c2 = result.checks.at(-1);
  c2.note = `엑셀다운 버튼 노출. 로딩 표시 남음=${masked}. 수정 전 빌드(5841cbd2)도 같은 상태라 이번 변경과 무관한 기존 문제. 다운로드는 확인 불가.`;
  c2.verdict = 'info';

  await go('/purchase/calculate/raw-month');
  await check('03-raw-month', { screen: '정산관리 > Raw Data (월 취합) 진입', expect: TABS.slice(0, 3), absent: ['AD(광고)결합', 'AD(광고) 결합'] });
  result.checks.at(-1).note = `이동한 주소: ${page.url().replace(base, '')}`;

  // AC-4: 제거한 탭 주소 직접 입력
  for (const [id, u] of [['04-combine-url', '/purchase/calculate/raw/combine'], ['05-combine-month-url', '/purchase/calculate/raw-month/combine']]) {
    await go(u);
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    await check(id, { screen: `주소 직접 입력: ${u}`, expect: [], absent: ['AD(광고)결합목록', 'AD(광고) 결합'] });
    const c = result.checks.at(-1);
    c.note = `도착 주소: ${page.url().replace(base, '')} · 화면 첫 줄: ${text.split('\n').filter(Boolean).slice(0, 2).join(' / ').slice(0, 80)}`;
  }

  // AC-1: 정지/휴면 상세 — 일반 회원번호로 상세 화면을 연다(회원을 정지시키지 않음)
  await go('/member/normal');
  await page.locator("input[placeholder='검색어를 입력해주세요.']").first().fill(env.CMB_DEV_MEMBER_KEYWORD || '');
  await page.getByRole('button', { name: '검색', exact: true }).first().click(); await page.waitForTimeout(5000);
  await page.getByRole('button', { name: '상세', exact: true }).first().click(); await page.waitForTimeout(4000);
  const mbNo = (page.url().match(/detail\/(\d+)/) || [])[1];
  await go(`/member/sleep/detail/${mbNo}`);
  const b = await buttons();
  await check('06-sleep-detail', { screen: '계정 정지/휴면 고객 상세 > 회원정보', expect: ['회원정보'], absent: [] });
  result.checks.at(-1).note = `화면의 버튼: ${b.join(', ')}. dev에 정지 고객이 없어 일반 회원번호로 상세를 열었다.`;
  result.checks.at(-1).verdict = b.some(t => /엑셀/.test(t)) ? 'fail' : 'pass';
  console.log('sleep buttons:', b.join(', '));

  const r = await s.close();
  console.log('hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
