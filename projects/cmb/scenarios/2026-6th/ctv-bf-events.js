// 주의: 찜·댓글·리뷰를 dev 에 실제로 남긴다(BF 사건 적재 확인용). 검수 계정으로만 돌리고, 끝나면 남긴 댓글·리뷰를 정리한다.
// BF 통계 분석 통합 검수(2026-10-01) · 레CTV(vue-app, webOS): VOD 탭 노출 → 상세 클릭 → 찜 → 이모지 댓글 → 리뷰(API) → 재생
// 준비: qa patch ctv. DEVICE=tizen 이면 워크트리의 src/api/checkVersion.js deviceType 을 'tizen' 으로 로컬 변경한 뒤 실행한다(커밋 안 함).
// 요청은 dev 서버로 그대로 보낸다(가로채지 않음). 사건 적재는 dev DB 대조로 따로 확인한다.
const { session, statePath, Q } = require('../../../../lib/web');
const { ctvLogin, webosStub, tizenStub } = require('../../lib/login');
const base = 'http://127.0.0.1:5102';
const storage = statePath('ctv');
const DEVICE = process.env.DEVICE || 'webos';
const TICKET = 'BF-ctv-' + DEVICE;
const BF = /\/api\/v[0-9]\/media\/[A-Z]+\/(view-logs|\d+\/click|like\/\d+|hit-history\/\d+)|\/api\/v1\/media\/comment\/[A-Z]+$/;

async function banner(page, html) {
  await page.evaluate(h => { let d = document.getElementById('__qa'); if (!d) { d = document.createElement('div'); d.id = '__qa'; Object.assign(d.style, { position: 'fixed', left: '40px', right: '40px', bottom: '40px', zIndex: 2147483647, background: 'rgba(17,24,39,.92)', color: '#fff', font: '26px/1.5 sans-serif', padding: '18px 26px', borderRadius: '12px', border: '3px solid #22c55e', whiteSpace: 'pre-wrap', wordBreak: 'break-all', pointerEvents: 'none' }); document.body.appendChild(d); } d.innerHTML = h; }, html);
}
const unbanner = page => page.evaluate(() => document.getElementById('__qa')?.remove());
async function closePopup(page) { for (let i = 0; i < 3; i++) { const b = page.getByText('닫기', { exact: true }); if (!(await b.count()) || !(await b.first().isVisible())) return; await b.first().click().catch(() => {}); await page.waitForTimeout(1500); } }

(async () => {
  console.log('login ->', await ctvLogin(base, storage));
  const s = await session({ app: 'vue-app', ticket: TICKET, title: `BF 사건 발생 (레CTV ${DEVICE})`, base, storage, viewport: { width: 1920, height: 1080 } });
  const { page } = s;
  const log = []; let commentReq = null;
  page.on('request', r => { if (/\/api\/v1\/media\/comment\/[A-Z]+$/.test(r.url()) && r.method() === 'POST') commentReq = { url: r.url(), headers: r.headers() }; });
  page.on('response', async r => {
    const u = r.url(); if (!/java-api-dev\.cmbrainbowtv/.test(u) || r.request().method() === 'GET' || /home\/display\/view/.test(u)) return;
    let body = ''; try { body = (await r.text()).slice(0, 160); } catch {}
    log.push({ at: new Date().toISOString(), method: r.request().method(), path: u.replace(/^https?:\/\/[^/]+/, ''), req: (r.request().postData() || '').slice(0, 160), status: r.status(), body });
  });
  const show = async (title, re) => {
    await page.waitForTimeout(2500);
    const hit = log.filter(x => re.test(x.path));
    await banner(page, `<b>${title}</b>\n` + (hit.length ? hit.slice(-3).map(x => `${x.method} ${x.path}  → ${x.status}\n  요청 ${x.req || '{}'}`).join('\n') : '<span style="color:#fca5a5">요청 없음</span>'));
    await page.waitForTimeout(3500);
    return hit;
  };
  s.result.startedAtKst = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
  if (DEVICE === 'tizen') await s.ctx.addInitScript(tizenStub);
  await s.ctx.addInitScript(webosStub);
  await page.goto(base + '/', { waitUntil: 'load', timeout: 90000 }); await page.waitForTimeout(8000); await closePopup(page);

  // 1) VOD 탭 목록 노출 → view-logs
  await page.focus('#header_vod'); await page.keyboard.press('Enter'); await page.waitForTimeout(7000); await closePopup(page);
  const imp = await show('① 콘텐츠 노출 (VOD 탭 목록이 화면에 보임)', /view-logs/);
  await s.shot('01-impression', { screen: 'VOD 탭 목록 노출', note: imp.map(x => x.req).join(' / ') });
  await unbanner(page);

  // 2) 첫 추천 콘텐츠 상세 → click
  const meIdx = await page.evaluate(() => null);
  const target = await page.evaluate(n => { const c = [...document.querySelectorAll('[id]')].filter(e => e.offsetParent && /^(recommend|history|suggest_\d+|cate_\d+)_\d+$/.test(e.id) && (e.innerText || '').includes(n)); return c[0] && c[0].id; }, '임현식의 장터사람들 87회');
  console.log('target', target);
  await page.focus('#' + (target || 'recommend_0')); await page.waitForTimeout(1200); await page.keyboard.press('Enter'); await page.waitForTimeout(6000);
  const clk = await show('② 콘텐츠 클릭 (상세 열기)', /\/click$/);
  const clickMe = (clk.at(-1)?.path.match(/\/(\d+)\/click$/) || [])[1];
  s.result.meIdx = clickMe || meIdx;
  await s.shot('02-click', { screen: `콘텐츠 상세 열기 (m_idx ${s.result.meIdx})` });
  await unbanner(page);

  // 3) 찜: 켜질 때만 사건이 남으므로 이미 찜이면 한 번 끄고 다시 켠다
  await page.focus('#detailLikeButton_0'); await page.waitForTimeout(1000); await page.keyboard.press('Enter'); await page.waitForTimeout(3000);
  let lk = log.filter(x => /like\/\d+/.test(x.path));
  if (lk.length && lk.at(-1).method === 'DELETE') { await page.keyboard.press('Enter'); await page.waitForTimeout(3000); }
  lk = await show('③ 찜 켜기', /like\/\d+/);
  await s.shot('03-like', { screen: '찜 켜기', note: lk.map(x => x.body).join(' / ') });
  await unbanner(page);

  // 4) 댓글 탭 → 이모지 댓글 저장
  const cmtTab = await page.evaluate(() => [...document.querySelectorAll('[id^=detailTabButton_]')].find(e => (e.innerText || '').includes('댓글'))?.id);
  await page.focus('#' + cmtTab); await page.click('#' + cmtTab); await page.waitForTimeout(3000);
  await page.waitForSelector('#detailComment_0', { timeout: 15000 }).catch(async e => { await page.screenshot({ path: `${Q}/shots/vue-app/${TICKET}-fail-comment.png` }); throw e; });
  for (let i = 0; i < 3 && !(await page.$('#btnEmoji_3')); i++) { await page.focus('#detailComment_0'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500); if (!(await page.$('#btnEmoji_3'))) { await page.click('#detailComment_0').catch(() => {}); await page.waitForTimeout(2000); } }
  await page.focus('#btnEmoji_3'); await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  await s.shot('04a-comment-input', { screen: '이모지 댓글 입력' });
  const save = await page.evaluate(() => [...document.querySelectorAll('[id^=emojiButton_]')].find(e => (e.innerText || '').includes('저장'))?.id);
  if (save) { await page.focus('#' + save); await page.keyboard.press('Enter'); }
  const cm = await show('④ 댓글 등록 (이모지)', /\/comment\/[A-Z]+$/);
  await s.shot('04-comment', { screen: '댓글 등록', note: cm.map(x => `${x.status} ${x.body}`).join(' / ') });
  await unbanner(page);

  // 4-2) 리뷰: 레CTV 화면에는 리뷰 입력이 없어 같은 댓글 API 를 mcoType=REVIEW 로 한 번 보낸다(앱이 보낸 헤더 그대로)
  if (commentReq) {
    const r = await page.request.post(commentReq.url, { headers: commentReq.headers, data: { meIdx: Number(s.result.meIdx), mcoType: 'REVIEW', mcoComment: 'QA 리뷰 확인용', mcoTv: 1 } });
    const body = (await r.text()).slice(0, 160);
    log.push({ at: new Date().toISOString(), method: 'POST', path: commentReq.url.replace(/^https?:\/\/[^/]+/, '') + ' (REVIEW)', req: 'mcoType=REVIEW', status: r.status(), body });
    await banner(page, `<b>④-2 리뷰 등록 (API, mcoType=REVIEW)</b>\nPOST ${commentReq.url.replace(/^https?:\/\/[^/]+/, '')} → ${r.status()}\n  ${body}`);
    await page.waitForTimeout(4000);
    await s.shot('04b-review', { screen: '리뷰 등록(API 직접 호출)', note: `${r.status()} ${body}` });
    await unbanner(page);
  }

  // 5) 재생 (전체화면) 20초 → 시청 기록
  await page.focus('#detailTabButton_4').catch(() => {});
  await page.focus('#watchButton_0'); await page.waitForTimeout(800); await page.keyboard.press('Enter'); await page.waitForTimeout(20000);
  const wt = await show('⑤ 재생 20초 (시청 기록 요청)', /hit-history|watch|play|history/);
  await s.shot('05-watch', { screen: '재생 중', note: wt.map(x => x.path).join(' / ') });
  await unbanner(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(4000);

  s.result.bfRequests = log;
  s.result.finishedAtKst = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
  const res = await s.close();
  console.log(JSON.stringify(log, null, 1));
  console.log('meIdx', res.meIdx, 'video', res.video, 'errors', res.errors.length, res.errors.slice(0, 3));
})().catch(e => { console.error('FAILED', e); process.exit(1); });
