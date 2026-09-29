// CTVR-16170 CMS: 코인몰 → 코인보석함 명칭 변경. 조회·모달 열기만 하고 저장하지 않는다.
const { session, statePath } = require('../../../../lib/web');
const { adminLogin } = require('../../lib/login');
const base = process.env.BASE || 'http://127.0.0.1:5103';
const storage = statePath('cms');
const viewport = { width: 1600, height: 1000 };
const DATA = "'쇼핑 - 코인몰 추천관리1~3'은 dev 관리자가 입력한 메뉴명 데이터라 코드 변경 대상이 아님.";

(async () => {
  await adminLogin(base, storage);
  const s = await session({ app: 'vue-cms', ticket: 'CTVR-16170', title: 'CMS 코인몰 명칭을 코인보석함으로 변경', base, storage, viewport });
  const { page, check, result } = s;
  const go = async u => { await page.goto(base + u, { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(4000); };
  const noMall = ['코인몰 경품', '코인몰 카테고리', '코인몰상품', '쇼핑/코인몰'];

  await go('/content/pick/shopping');
  await check('01-pick-shopping', { screen: '쇼핑/코인보석함 추천관리 목록(메뉴·제목·구분 값)', expect: ['쇼핑/코인보석함 추천관리', '코인보석함상품'], absent: noMall });
  result.checks.at(-1).note = DATA;

  // 구분이 '코인보석함상품'인 행의 수정 버튼 → 추천 수정 모달
  const row = page.locator('tr', { hasText: '코인보석함상품' }).first();
  await row.getByRole('button', { name: '수정' }).click(); await page.waitForTimeout(2500);
  await check('02-pick-modal', { screen: '추천 수정 모달: 메뉴종류 라디오', expect: ['코인보석함상품'], absent: noMall });
  result.checks.at(-1).note = '모달만 열고 저장하지 않음.';

  await page.getByRole('button', { name: '등록하기' }).first().click(); await page.waitForTimeout(3000);
  await check('03-prize-choice-modal', { screen: '경품 선택 모달 제목', expect: ['코인보석함 경품 목록'], absent: ['코인몰 경품 목록'] });
  result.checks.at(-1).note = '모달만 열고 선택·저장하지 않음.';

  await go('/operate/history/prize');
  await check('04-prize', { screen: '코인보석함 경품 관리', expect: ['코인보석함 경품 관리'], absent: noMall });
  await go('/operate/history/prize/category');
  await check('05-prize-category', { screen: '코인보석함 카테고리 관리', expect: ['코인보석함 카테고리 관리'], absent: noMall });
  await go('/operate/history/cmb');
  await check('06-trade-history', { screen: '코인보석함 경품 교환 내역', expect: ['코인보석함 경품 교환 내역'], absent: noMall });
  result.checks.at(-1).note = `탭 제목: ${await page.title()}`;

  const r = await s.close();
  console.log('hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
