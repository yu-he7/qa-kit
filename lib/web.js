// 웹 촬영 엔진(Playwright): 시나리오 하나 = 브라우저 컨텍스트 하나 = 영상 하나.
// 결과: <run>/shots/<app>/<ticket>-<nn>-<id>.png, <run>/videos/<app>/<ticket>.webm, <run>/results/<app>-<ticket>.json
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const Q = cfg.runDir();
const proj = cfg.project();
const env = cfg.accounts(proj);
// 검수 대상이 아닌 서버(운영 등)로 나가는 요청은 막고 기록한다. 패턴은 project.json 의 blockHosts.
const BLOCK = proj.blockHosts ? new RegExp(proj.blockHosts) : null;
const WATCH = proj.watchHostSuffix || '';

async function session({ app, ticket, title, base, deviceName, viewport, storage, video = true, contextOptions = {}, initScripts = [] }) {
  const shotDir = path.join(Q, 'shots', app); const vidDir = path.join(Q, 'videos', app); const resDir = path.join(Q, 'results');
  [shotDir, vidDir, resDir].forEach(d => fs.mkdirSync(d, { recursive: true }));
  const size = viewport || (deviceName ? devices[deviceName].viewport : { width: 1440, height: 900 });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...(deviceName ? devices[deviceName] : {}), viewport: size, locale: 'ko-KR',
    ...(storage && fs.existsSync(storage) ? { storageState: storage } : {}),
    ...(video ? { recordVideo: { dir: path.join(vidDir, '.tmp'), size } } : {}),
    ...contextOptions,
  });
  for (const s of initScripts) await ctx.addInitScript(s);
  const hosts = new Set(); const blocked = [];
  if (BLOCK) await ctx.route(BLOCK, r => { blocked.push(r.request().url().slice(0, 120)); return r.abort(); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
  page.on('request', r => { try { const h = new URL(r.url()).host; if (!WATCH || h.endsWith(WATCH)) hosts.add(h); } catch {} });
  const result = { app, ticket, title, base, startedAt: new Date().toISOString(), checks: [], errors, hosts: [], blocked };
  let n = 0;
  const fileOf = id => /^\d/.test(id) ? `${ticket}-${id}.png` : `${ticket}-${String(++n).padStart(2, '0')}-${id}.png`;

  // 화면에 기대 문구가 있는지(없어야 할 문구는 없는지) 대조하고, 찾은 요소에 빨간 테두리를 그린 뒤 찍는다.
  // extra: 문구 외 판정 [{text, ok}] (예: 입력 길이). 판정 항목이 하나도 없으면 info.
  async function check(id, { screen, expect = [], absent = [], extra = [], note = '', full = false } = {}) {
    await page.waitForTimeout(800);
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    const found = [...expect.map(t => ({ text: t, ok: text.includes(t) })), ...extra];
    const gone = absent.map(t => ({ text: t, ok: !text.includes(t) }));
    for (const t of expect) {
      await page.getByText(t, { exact: false }).first()
        .evaluate(el => { el.style.outline = '3px solid #e11d48'; el.style.outlineOffset = '2px'; }, null, { timeout: 1500 }).catch(() => {});
    }
    const file = fileOf(id);
    await page.screenshot({ path: path.join(shotDir, file), fullPage: full });
    const all = [...found, ...gone];
    const verdict = !all.length ? 'info' : all.every(x => x.ok) ? 'pass' : 'fail';
    result.checks.push({ id, screen, url: page.url(), shot: `shots/${app}/${file}`, expect: found, absent: gone, note, verdict });
    console.log(`${verdict.toUpperCase()} ${ticket} ${id} ${all.filter(x => !x.ok).map(x => x.text).join(' | ')}`);
    return result.checks.at(-1);
  }

  // 판정 없이 찍기(참고용)
  async function shot(id, { screen, note = '', full = false } = {}) {
    const file = fileOf(id);
    await page.screenshot({ path: path.join(shotDir, file), fullPage: full });
    result.checks.push({ id, screen, url: page.url(), shot: `shots/${app}/${file}`, note, verdict: 'info' });
    return result.checks.at(-1);
  }

  // 화면으로 확인할 수 없어 코드·데이터로만 확인한 항목
  function info(id, { screen, note }) { result.checks.push({ id, screen, shot: null, expect: [], absent: [], note, verdict: 'info' }); }

  async function close() {
    const v = page.video();
    await ctx.close(); await browser.close();
    if (v) {
      const src = await v.path(); const dst = path.join(vidDir, `${ticket}.webm`);
      fs.renameSync(src, dst); result.video = `videos/${app}/${ticket}.webm`;
    }
    result.hosts = [...hosts].sort();
    if (blocked.length) errors.push(`차단한 요청 ${blocked.length}건: ${blocked.slice(0, 3).join(', ')}`);
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(resDir, `${app}-${ticket}.json`), JSON.stringify(result, null, 2));
    return result;
  }

  return { page, ctx, check, shot, info, close, result };
}

// 로그인 세션만 만든다(영상 없음). 촬영 컨텍스트는 저장된 storageState 를 재사용한다.
// maxAgeMin 안에 만든 세션이 있으면 재사용한다(인증 문자 등 부작용을 줄이기 위해).
async function saveLogin({ base, loginPath, deviceName, viewport, storage, fill, maxAgeMin = 0, initScripts = [] }) {
  if (maxAgeMin && fs.existsSync(storage) && Date.now() - fs.statSync(storage).mtimeMs < maxAgeMin * 60000) return 'reuse';
  fs.mkdirSync(path.dirname(storage), { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...(deviceName ? devices[deviceName] : {}), ...(viewport ? { viewport } : {}), locale: 'ko-KR' });
  for (const s of initScripts) await ctx.addInitScript(s);
  if (BLOCK) await ctx.route(BLOCK, r => r.abort());
  const page = await ctx.newPage();
  await page.goto(base + loginPath, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2000);
  await fill(page, env);
  await ctx.storageState({ path: storage });
  const url = page.url();
  await browser.close();
  return url;
}

// 로그인 세션 파일 위치: <run>/state/<app>.json (계정 토큰이 들어 있으므로 run 폴더 밖으로 옮기지 않는다)
const statePath = app => path.join(Q, 'state', `${app}.json`);

module.exports = { session, saveLogin, statePath, env, Q, proj };
