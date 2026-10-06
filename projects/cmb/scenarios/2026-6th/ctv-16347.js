// 레CTV(vue-app) CTVR-16347 쇼핑 구매 링크에 플랫폼 값 추가
// 준비: qa patch ctv. DEVICE=tizen 이면 워크트리의 src/api/checkVersion.js deviceType 을 'tizen' 으로 로컬 변경한 뒤 실행한다(커밋 안 함).
// 문자 전송 API는 가로채서 실제로 보내지 않는다. 요청 본문(shopLink)을 화면 위에 띄워 영상에 남긴다.
const { session, statePath } = require('../../../../lib/web');
const { ctvLogin, webosStub, tizenStub } = require('../../lib/login');
const base = 'http://127.0.0.1:5102';
const storage = statePath('ctv');
const viewport = { width: 1920, height: 1080 };
const DEVICE = process.env.DEVICE || 'webos';
const TICKET = 'CTVR-16347' + (DEVICE === 'tizen' ? '-tizen' : '');
const DIRECT = { idx: 14092, name: '생활공유 옥수수 수세미', search: '옥수수 수세미' };
const RELAY = { idx: 14254, name: 'ON AIR 20' };

async function closePopup(page) { for (let i = 0; i < 3; i++) { const b = page.getByText('닫기', { exact: true }); if (!(await b.count()) || !(await b.first().isVisible())) return; await b.first().click().catch(() => {}); await page.waitForTimeout(1500); } }
async function banner(page, html) {
  await page.evaluate(h => { let d = document.getElementById('__qa'); if (!d) { d = document.createElement('div'); d.id = '__qa'; Object.assign(d.style, { position: 'fixed', left: '40px', right: '40px', bottom: '40px', zIndex: 2147483647, background: 'rgba(17,24,39,.92)', color: '#fff', font: '28px/1.5 sans-serif', padding: '20px 28px', borderRadius: '12px', border: '3px solid #22c55e', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }); document.body.appendChild(d); } d.innerHTML = h; }, html);
}
async function openItem(s, item) {
  const { page } = s;
  if (item.search) {
    await page.goto(base + '/#/main/search', { waitUntil: 'load' }); await page.waitForTimeout(4000); await closePopup(page);
    await page.focus('#search_0'); await page.keyboard.type(item.search, { delay: 120 }); await page.keyboard.press('Enter'); await page.waitForTimeout(4000);
    await page.focus('#searchTab_3'); await page.waitForTimeout(3000);
    await page.focus('#searchT_0'); await page.waitForTimeout(1500);
    await page.keyboard.press('Enter'); await page.waitForTimeout(5000);
    return;
  }
  await page.focus('#header_shop'); await page.waitForTimeout(6000); await closePopup(page);
  const id = await page.evaluate(n => { const c = [...document.querySelectorAll('[id^=shoppingcate_]')].filter(e => (e.innerText || '').includes(n)); c.sort((a, b) => (a.innerText.length - b.innerText.length)); return c[0] && c[0].id; }, item.name);
  console.log('item element', item.name, id);
  if (!id) throw new Error('item not found in shop tab: ' + item.name);
  await page.focus('#' + id); await page.waitForTimeout(1500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(5000);
}
async function buyAndSend(s, item, label) {
  const { page } = s;
  const buy = page.locator('[id^=detailBuyLongButton]').first();
  await buy.focus(); await page.waitForTimeout(1200);
  await s.check(`${label}-detail`, { screen: `${item.name}(${item.idx}) 상세의 구매 버튼`, expect: [item.name] });
  await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
  await s.check(`${label}-modal`, { screen: '구매 링크 전달 창', expect: ['구매 링크 전달'] });
  await page.fill('#showBuyPhone_0_input', '01000000000'); await page.waitForTimeout(800);
  await page.focus('#linkSendButton_1'); await page.waitForTimeout(800);
  await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
}

(async () => {
  console.log('login ->', await ctvLogin(base, storage));
  const s = await session({ app: 'vue-app', ticket: TICKET, title: `쇼핑 구매 링크에 플랫폼 값 추가 (${DEVICE})`, base, storage, viewport });
  const sent = [];
  await s.ctx.route(/java-api-dev\.cmbrainbowtv\.co\.kr\/api\/v1\/advertise\/[A-Z]+\/send\/link/, r => {
    sent.push({ url: r.request().url(), body: r.request().postDataJSON() });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 1, message: '성공하였습니다.', result: null }) });
  });
  if (DEVICE === 'tizen') await s.ctx.addInitScript(tizenStub);
  await s.ctx.addInitScript(webosStub);
  await s.page.goto(base + '/', { waitUntil: 'load', timeout: 90000 }); await s.page.waitForTimeout(8000); await closePopup(s.page);
  const want = DEVICE === 'tizen' ? 'TIZEN' : 'WEBOS';

  // 1) 직접판매 상품
  await openItem(s, DIRECT);
  await buyAndSend(s, DIRECT, '01-direct');
  const d = sent.at(-1);
  await banner(s.page, `<b>문자 전송 요청 (녹화 도구가 가로챔 · 실제 발송 안 함)</b>\n${d ? d.url.replace(/^.*\/api/, 'POST /api') : '요청 없음'}\nshopLink = <span style="color:#86efac">${d ? d.body.shopLink : '-'}</span>`);
  await s.check('01-direct-sent', { screen: `직접판매 상품 문자 전송 요청의 shopLink (기대: ?platform=${want})`, expect: [`/shopping/${DIRECT.idx}/purchase?platform=${want}`] });
  s.result.checks.at(-1).note = `요청: ${JSON.stringify(d)}`;
  await s.page.waitForTimeout(2500);
  await s.page.evaluate(() => document.getElementById('__qa')?.remove());
  await s.page.goto(base + '/', { waitUntil: 'load' }); await s.page.waitForTimeout(6000); await closePopup(s.page);

  // 2) 중계판매 상품 (외부 링크는 바뀌지 않아야 함)
  await openItem(s, RELAY);
  await buyAndSend(s, RELAY, '02-relay');
  const r = sent.at(-1);
  const relayOk = r && r !== d && !String(r.body.shopLink).includes('platform=');
  await banner(s.page, `<b>문자 전송 요청 (녹화 도구가 가로챔 · 실제 발송 안 함)</b>\n${r && r !== d ? r.url.replace(/^.*\/api/, 'POST /api') : '요청 없음'}\nshopLink = <span style="color:#86efac">${r && r !== d ? r.body.shopLink : '-'}</span>\n→ ${relayOk ? '외부 링크 그대로, platform 없음' : '확인 필요'}`);
  await s.check('02-relay-sent', { screen: '중계판매 상품 문자 전송 요청의 shopLink (외부 링크 그대로)', expect: ['cmbrainbowtv.co.kr'], absent: ['platform='] });
  s.result.checks.at(-1).note = `요청: ${JSON.stringify(r)}`;
  if (!relayOk) s.result.checks.at(-1).verdict = 'fail';
  await s.page.waitForTimeout(2500);
  const res = await s.close();
  console.log(JSON.stringify(sent), '\nhosts', res.hosts.join(','), 'blocked', res.blocked.length, 'errors', res.errors.length);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
