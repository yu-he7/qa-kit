// CTVR-16168 웹: 코인몰 → 코인보석함 명칭 변경
// 1) 있는 그대로: /gift/coin 이 기존 결함(잘못된 util import)으로 빈 화면 → 증거만 남긴다
// 2) QA 로컬 패치(import 만 giftCoinUtil 로 교체, 커밋 안 함)로 렌더해 바뀐 문구를 확인한다
const fs = require('fs');
const { session, saveLogin, statePath, Q } = require('../../../../lib/web');
const base = process.env.BASE || 'http://127.0.0.1:5100';
const storage = statePath('web');
const W = require('path').join(Q, 'wt/rainbow-vue-web/src/components/gift/GiftCoinListComponent.vue');
const FROM = 'import prizeUtil from "@/components/prize/prizeUtil";';
const TO = 'import prizeUtil from "@/components/gift/giftCoinUtil"; // QA local only';

(async () => {
  let src = fs.readFileSync(W, 'utf8'); if (src.includes(TO)) fs.writeFileSync(W, src.replace(TO, FROM));
  await saveLogin({
    base, loginPath: '/login', viewport: { width: 1440, height: 900 }, storage,
    fill: async (p, env) => {
      await p.locator('input[type=text], input[type=email]').first().fill(env.CMB_DEV_USER_ID);
      await p.locator('input[type=password]').first().fill(env.CMB_DEV_USER_PW);
      await p.getByRole('button', { name: '로그인', exact: true }).first().click();
      await p.waitForTimeout(5000);
    },
  });
  const s = await session({ app: 'vue-web', ticket: 'CTVR-16168', title: '웹 코인몰 명칭을 코인보석함으로 변경', base, storage, viewport: { width: 1440, height: 900 } });
  const { page, check, result } = s;

  await page.goto(base + '/ddoba', { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(4000);
  await check('01-header', { screen: '있는 그대로: 로그인 후 첫 화면(헤더 메뉴)', expect: [], absent: ['코인몰'] });
  result.checks.at(-1).verdict = 'info';
  result.checks.at(-1).note = "'/'(코인보석함 홈)는 '/ddoba'로 리다이렉트되고, 헤더의 선물함>코인 메뉴는 주석 처리된 '/coin'으로 이동해 사용자가 코인보석함 화면에 들어갈 경로가 없음.";

  const before = result.errors.length;
  await page.goto(base + '/gift/coin', { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(5000);
  await check('02-gift-coin-asis', { screen: '있는 그대로: /gift/coin', expect: ['코인보석함'], absent: ['코인몰'] });
  result.checks.at(-1).verdict = 'info';
  result.checks.at(-1).note = `기존 결함으로 빈 화면: ${result.errors.slice(before).join(' / ') || '오류 없음'} — GiftCoinListComponent.vue가 prize/prizeUtil을 import해 'giftcoin' 설정을 못 찾음(develop에도 동일, 6차 변경과 무관).`;

  fs.writeFileSync(W, fs.readFileSync(W, 'utf8').replace(FROM, TO));
  await page.waitForTimeout(3000);
  await page.goto(base + '/gift/coin', { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(6000);
  await check('03-gift-coin-patched', { screen: 'QA 로컬 패치 후: /gift/coin 타이틀', expect: ['코인보석함'], absent: ['코인몰'] });
  result.checks.at(-1).note = 'QA 워크트리에서 import 한 줄만 giftCoinUtil로 바꿔 렌더(커밋 안 함). 티켓 문구 확인용.';
  const card = page.locator('text=골드 코인').first();
  await card.click().catch(e => console.log('card:', e.message.split('\n')[0])); await page.waitForTimeout(3000);
  await check('04-trade-modal-patched', { screen: 'QA 로컬 패치 후: 경품 교환 모달 안내 문구', expect: ['※코인보석함 경품의 교환/환불/취소는'], absent: ['코인몰'] });
  const r = await s.close();
  fs.writeFileSync(W, fs.readFileSync(W, 'utf8').replace(TO, FROM));
  console.log('hosts:', r.hosts.join(', '), 'blocked:', r.blocked.length, 'errors:', r.errors);
})();
