// CTVR-16348 모바일웹: 쇼핑 구매 링크의 platform 값을 주문 생성 요청에 전달
// 준비: qa patch webmobile (routes.js 의 쇼핑 구매 라우트 두 개 임시 해제, 커밋 안 함). 끝나면 qa unpatch webmobile.
// 실행: CASE=app-popup|settop-safari|none|invalid (기본 app-popup). 처음이면 LOGIN=1 로 로그인 세션을 만든다.
// 장바구니 생성·이니시스 결제창·결제 확인·주문 생성 호출은 모두 가로채서 가짜 응답을 준다. dev DB·결제에 아무것도 남지 않는다.
const { session, saveLogin, statePath } = require('../../../../lib/web');
const base = 'http://127.0.0.1:5101';
const storage = statePath('webmobile');
const ITEM = 14092; // 생활공유 옥수수 수세미 (직접판매)
const CASE = process.env.CASE || 'app-popup';
const CASES = {
  'app-popup':  { device: 'Pixel 5',   query: '?platform=APP',    expect: 'APP',    title: '레모 링크(platform=APP) · Android Chrome 카드 팝업 결제' },
  'settop-safari': { device: 'iPhone 13', query: '?platform=SETTOP', expect: 'SETTOP', title: '레TB 링크(platform=SETTOP) · iPhone Safari 결제창 이동 후 복귀' },
  'none':       { device: 'Pixel 5',   query: '',                 expect: null,     title: 'platform 없이 진입(웹에서 바로 구매)' },
  'invalid':    { device: 'Pixel 5',   query: '?platform=FOO',    expect: null,     title: '허용되지 않은 값(platform=FOO)' },
};
const C = CASES[CASE];

async function banner(page, html) {
  await page.evaluate(h => { let d = document.getElementById('__qa'); if (!d) { d = document.createElement('div'); d.id = '__qa'; Object.assign(d.style, { position: 'fixed', left: '8px', right: '8px', bottom: '8px', zIndex: 2147483647, background: 'rgba(17,24,39,.94)', color: '#fff', font: '13px/1.45 sans-serif', padding: '10px 12px', borderRadius: '8px', border: '2px solid #22c55e', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }); document.body.appendChild(d); } d.innerHTML = h; }, html).catch(() => {});
}

(async () => {
  if (process.env.LOGIN) {
    console.log('login ->', await saveLogin({ base, loginPath: '/auth/login', deviceName: 'iPhone 13', storage, fill: async (p, env) => {
      await p.fill("input[placeholder='이메일 형식의 아이디 입력']", env.CMB_DEV_USER_ID); await p.fill('input[type=password]', env.CMB_DEV_USER_PW);
      await p.getByRole('button', { name: '로그인', exact: true }).first().click(); await p.waitForTimeout(5000); } }));
  }
  const ticket = `CTVR-16348-${CASE}`;
  const s = await session({ app: 'vue-webmobile', ticket, title: C.title, base, storage, deviceName: C.device });
  const { page, ctx } = s; const cap = { cart: null, pg: null, chk: null, order: null };
  const J = b => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  // 테스트 계정의 실제 주소가 영상에 남지 않도록 배송지 목록도 가짜로 준다
  await ctx.route(/java-api-dev\.cmbrainbowtv\.co\.kr\/api\/v1\/delivery\/WEB(\?|$)/, r => r.request().method() === 'GET' ? r.fulfill(J({ success: true, code: 1, message: 'QA', result: { page: null, list: [
    { mdIdx: 900001, mdReceiver: 'QA 수령인', mdTel: '01000000000', mdAddr: '서울특별시 QA구 가짜로 1', mdAddrDetail: '101호', mdZipcode: '00000', mdIsDefault: 1, adIdx: 1, adIsExpressCost: 0 } ] } })) : r.abort());
  await ctx.route(/java-api-dev\.cmbrainbowtv\.co\.kr\/api\/v1\/cart\/WEB/, r => { cap.cart = r.request().postDataJSON(); return r.fulfill(J({ success: true, code: 1, message: 'QA', result: { data: 'QA-ORDER-0001' } })); });
  await ctx.route(/java-api-dev\.cmbrainbowtv\.co\.kr\/api\/v1\/order\/inis\/WEB\/chk\/pay/, r => { cap.chk = r.request().url(); return r.fulfill(J({ success: true, code: 1, message: 'QA', result: null })); });
  await ctx.route(/java-api-dev\.cmbrainbowtv\.co\.kr\/api\/v1\/order\/shop(\?|$)/, r => { cap.order = r.request().postDataJSON(); return r.fulfill(J({ success: true, code: 1, message: 'QA', result: { data: 999999 } })); });
  await ctx.route(/java-api-dev\.cmbrainbowtv\.co\.kr\/order\/inis\/mpayment\/dev/, r => {
    cap.pg = r.request().url();
    const back = `${base}/pay/result/success`;
    const html = `<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px sans-serif;padding:24px;background:#fef3c7"><h2>가짜 이니시스 결제창 (녹화 도구)</h2><p>실제 결제 없음. 2초 뒤 ${C.device === 'iPhone 13' ? '결제 완료 화면으로 돌아갑니다' : '창을 닫습니다'}.</p><p style="word-break:break-all;font-size:12px">${cap.pg.replace(/&/g, '&amp;')}</p><script>setTimeout(()=>{ ${C.device === 'iPhone 13' ? `location.href=${JSON.stringify(back)}` : 'window.close()'} },2000)</script>`;
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });

  await page.goto(`${base}/shopping/${ITEM}/purchase${C.query}`, { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(5000);
  const stored1 = await page.evaluate(() => sessionStorage.getItem('shopping-purchase-platform'));
  await banner(page, `<b>${C.title}</b>\n진입 주소: /shopping/${ITEM}/purchase${C.query}\nsessionStorage 보관값 = <b style="color:#86efac">${stored1}</b>`);
  await s.check('01-enter', { screen: `쇼핑 구매 화면 진입 (${C.query || '값 없음'})`, expect: ['레인보우 쇼핑 상품 구매'] });
  s.result.checks.at(-1).note = `보관값: ${stored1}`;
  await page.getByRole('button', { name: '구매하기' }).first().click(); await page.waitForTimeout(5000);
  await s.check('02-detail', { screen: '구매 상세 화면(주소에서 platform 값이 사라짐)', expect: ['레인보우 쇼핑 구매'] });
  s.result.checks.at(-1).note = `주소: ${page.url().replace(base, '')} / 보관값: ${await page.evaluate(() => sessionStorage.getItem('shopping-purchase-platform'))}`;
  await page.locator('button.btn-shopping-purchase', { hasText: '배송지' }).first().click(); await page.waitForTimeout(2000);
  await page.getByText('QA 수령인').first().click(); await page.waitForTimeout(600);
  await page.getByRole('button', { name: '저장' }).first().click(); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '신용카드' }).first().click().catch(() => page.locator('.btn-pay').first().click());
  await page.locator('.common-check').first().click(); await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(800);
  await s.shot('03-before-pay', { screen: '카드 선택·약관 동의 후 구매하기 직전' });
  const popupP = C.device === 'iPhone 13' ? null : ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null);
  await page.locator('button.btn-common', { hasText: '구매하기' }).last().click();
  if (popupP) { const pop = await popupP; if (pop) await pop.waitForEvent('close', { timeout: 20000 }).catch(() => {}); }
  for (let i = 0; i < 20 && !cap.order; i++) await page.waitForTimeout(1000);
  await page.waitForTimeout(2500);
  const stored2 = await page.evaluate(() => sessionStorage.getItem('shopping-purchase-platform')).catch(() => 'n/a');
  const pgHasPlatform = cap.pg ? /[?&]platform=/.test(cap.pg) : null;
  const got = cap.order ? (cap.order.platform ?? '(없음)') : '(주문 요청 없음)';
  await banner(page, `<b>주문 생성 요청 POST /api/v1/order/shop (녹화 도구가 가로챔)</b>\nplatform = <b style="color:#86efac;font-size:16px">${got}</b>   (기대: ${C.expect ?? '보내지 않음'})\n본문: ${cap.order ? JSON.stringify(cap.order) : '-'}\n\n결제창 요청에 platform: ${pgHasPlatform === null ? '요청 없음' : pgHasPlatform ? '있음' : '<b style="color:#fca5a5">없음</b>'}\n결제 후 sessionStorage 보관값 = <b>${stored2}</b>`);
  const okOrder = C.expect ? cap.order?.platform === C.expect : (cap.order && !('platform' in cap.order));
  await s.shot('04-order', { screen: '주문 생성 요청 본문과 결제 후 보관값' });
  const last = s.result.checks.at(-1);
  last.verdict = okOrder && stored2 === null ? 'pass' : 'fail';
  last.expect = [{ text: `주문 요청 platform=${C.expect ?? '없음'}`, ok: !!okOrder }, { text: '결제 후 보관값 삭제', ok: stored2 === null }];
  last.note = `주문 본문: ${JSON.stringify(cap.order)} / 결제창 요청: ${cap.pg} / 결제창 요청에 platform 포함: ${pgHasPlatform}`;
  await page.waitForTimeout(3000);
  const r = await s.close();
  console.log(CASE, JSON.stringify({ okOrder, stored1, stored2, pgHasPlatform, order: cap.order }), '\nhosts', r.hosts.join(','), 'blocked', r.blocked.length, 'errors', r.errors.slice(0, 3));
})().catch(e => { console.error('FAILED', e); process.exit(1); });
