// <run>/results/*.json + checklist.json → <run>/report/index.html (사진·영상은 상대 경로로 참조)
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { REASONS, UNCLASSIFIED, VERDICT, asList, reasonOf, loadRun } = require('./results');
const Q = cfg.runDir();
const run = cfg.run();
let proj = null; try { proj = cfg.project(); } catch {}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const data = loadRun(Q, proj);
const { checklist, results, groups, template, broken } = data;
const label = VERDICT;
const badge = v => `<span class="v ${esc(v)}">${esc(label[v] || v)}</span>`;
const reasonTag = r => r ? `<span class="tag">${esc(REASONS[r] || r)}</span>` : '';
const kitTag = m => m && m.kit === 'B' ? '<span class="tag human">사람 판정</span>' : '';
const handoffOf = m => m && m.handoff ? `<div class="handoff">앞서 사람이 할 일: ${esc(m.handoff)}</div>` : '';

// 같은 티켓(=TC)이 앱별로 여러 항목이면 앵커를 나눈다
const seen = {};
for (const g of groups) { const n = seen[g.item.ticket] = (seen[g.item.ticket] || 0) + 1; g.anchor = n === 1 ? g.item.ticket : `${g.item.ticket}-${n}`; }

const count = { pass: 0, partial: 0, info: 0, fail: 0, todo: 0 };
for (const g of groups) count[g.verdict] = (count[g.verdict] || 0) + 1;

// "직접 확인할 것": 실패 → reason 별 참고(info) → 미실행
const fails = []; const byReason = {}; const notRun = [];
let rows = '', cards = '';
for (const g of groups) {
  const { item, results: rs, anchor } = g;
  const link = `<a href="#${esc(anchor)}">${esc(item.ticket)}</a>`;
  const tcCell = g.tc ? `${esc(g.tc.id)}${g.tc.journey ? ` <span class="muted">${esc(g.tc.journey)}</span>` : ''}` : '<span class="muted">—</span>';
  const title = g.outside && !template ? `${item.title || ''} (체크리스트 밖)` : item.title;
  rows += `<tr><td>${tcCell}</td><td>${link}</td><td>${esc(item.app)}</td><td>${esc(title)}</td><td>${badge(g.verdict)}</td></tr>`;

  // 확인 계획(checklist 항목): expect 는 문자열·배열 모두 받는다
  const plan = (item.checks || []).map(c => {
    const exp = asList(c.expect), abs = asList(c.absent);
    return `<li><b>${esc(c.id)}</b> ${esc(c.screen || '')} ${c.kit ? `<span class="tag${c.kit === 'B' ? ' human' : ''}">kit ${esc(c.kit)}${c.kit === 'B' ? ' 사람 판정' : ''}</span>` : ''}
      ${exp.length ? `<div>기대: ${exp.map(esc).join(', ')}</div>` : ''}${abs.length ? `<div>없어야 함: ${abs.map(esc).join(', ')}</div>` : ''}
      ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}${handoffOf(c)}</li>`;
  }).join('');

  let body = '';
  for (const r of rs) {
    if (r.video) body += `<video controls preload="metadata" src="../${esc(r.video)}"></video>`;
    if (r.hosts?.length) body += `<p class="muted" style="grid-column:1/-1;margin:0">요청 서버: ${r.hosts.map(esc).join(', ')}</p>`;
    for (const c of r.checks) {
      const m = g.meta(c); const reason = reasonOf(c, m);
      const miss = [...(c.expect || []).filter(x => !x.ok).map(x => `없음: ${x.text}`), ...(c.absent || []).filter(x => !x.ok).map(x => `남아 있음: ${x.text}`)];
      const want = [...(c.expect || []).map(x => x.text), ...(c.absent || []).map(x => `(없어야 함) ${x.text}`)];
      body += `<figure>${c.shot ? `<a href="../${esc(c.shot)}" target="_blank"><img loading="lazy" src="../${esc(c.shot)}"></a>` : '<div class="noshot">사진 없음</div>'}<figcaption>
        ${badge(c.verdict)} ${c.verdict !== 'pass' ? reasonTag(reason) : ''} ${kitTag(m)} <b>${esc(c.screen || c.id)}</b>
        ${want.length ? `<div>확인 문구: ${want.map(esc).join(', ')}</div>` : ''}
        ${miss.length ? `<div class="miss">${miss.map(esc).join('<br>')}</div>` : ''}
        ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}${handoffOf(m)}</figcaption></figure>`;
      if (c.verdict === 'pass') continue;
      const li = `<li>${link} <span class="muted">${esc(r.app)}</span> ${badge(c.verdict)} ${c.verdict === 'fail' ? reasonTag(reason) : ''} ${esc(c.screen || c.id)}${c.note ? ` — <span class="muted">${esc(c.note)}</span>` : ''}${m && m.handoff ? ` <span class="muted">(앞서: ${esc(m.handoff)})</span>` : ''}</li>`;
      if (c.verdict === 'fail') fails.push(li); else (byReason[reason || ''] ||= []).push(li);
    }
    if (r.errors?.length) body += `<details><summary>페이지 오류 ${r.errors.length}건</summary><pre>${esc(r.errors.join('\n'))}</pre></details>`;
  }
  if (!rs.length) {
    notRun.push(`<li>${link} ${badge('todo')} ${esc(item.title)}</li>`);
    body = `<p class="muted">아직 촬영하지 않았습니다.</p>`;
  } else if (!g.checks.length) {
    // 결과 파일은 있으나 check 가 없다(중간에 멈췄거나 영상만 남김). 판정할 것이 없으므로 미실행으로 센다.
    const why = `결과 파일은 있으나 판정 항목이 없습니다${rs.some(r => r.video) ? '(영상만 있음)' : ''}`;
    notRun.push(`<li>${link} ${badge('todo')} ${esc(item.title)} — <span class="muted">${why}</span></li>`);
    body += `<p class="muted" style="grid-column:1/-1">${why}.</p>`;
  }
  const planHtml = plan ? (rs.length ? `<details class="plan"><summary>확인 계획 ${item.checks.length}건</summary><ul>${plan}</ul></details>` : `<ul class="plan">${plan}</ul>`) : '';
  cards += `<section id="${esc(anchor)}"><h2>${esc(item.ticket)} · ${esc(item.app)} ${badge(g.verdict)}</h2>
    <p>${g.tc && g.tc.id !== item.ticket ? `<span class="muted">TC ${esc(g.tc.id)}</span> ` : ''}${esc(title)}</p>${planHtml}<div class="grid">${body}</div></section>`;
}

let todo = '';
if (fails.length) todo += `<h3>${badge('fail')} 실패 ${fails.length}건</h3><ul class="todo-list">${fails.join('')}</ul>`;
for (const key of [...Object.keys(REASONS), ...Object.keys(byReason).filter(k => k && !REASONS[k]), '']) {
  const list = byReason[key]; if (!list) continue;
  todo += `<h3>${badge('info')} ${esc(key ? REASONS[key] || key : UNCLASSIFIED)} ${list.length}건</h3><ul class="todo-list">${list.join('')}</ul>`;
}
if (notRun.length) todo += `<h3>${badge('todo')} 미실행 ${notRun.length}건</h3><ul class="todo-list">${notRun.join('')}</ul>`;

const warn = [];
if (template) warn.push(`checklist.json 이 템플릿(PROJ-0000) 그대로입니다. 결과 ${results.length}건이 checklist 와 이어지지 않았습니다. <code>bin/qa new &lt;project&gt; &lt;round&gt; --checklist &lt;파일&gt;</code> 로 만들거나 <code>$QA_RUN/checklist.json</code> 을 채운 뒤 다시 만드십시오.`);
if (broken.length) warn.push(`읽지 못한 결과 ${broken.length}건: ${broken.map(esc).join(' / ')}`);

const summary = `티켓 ${groups.length}건 · ${['pass', 'partial', 'info', 'fail', 'todo'].map(v => `${badge(v)} ${count[v]}`).join(' ')}`;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(run.title || '검수 결과')}</title><style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--card:#fff;--pass:#15803d;--partial:#0e7490;--fail:#b91c1c;--info:#1d4ed8;--todo:#a16207;--warn-bg:#fef3c7;--warn-fg:#78350f}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--line:#44403c;--card:#292524;--pass:#4ade80;--partial:#67e8f9;--fail:#f87171;--info:#93c5fd;--todo:#facc15;--warn-bg:#451a03;--warn-fg:#fde68a}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:1200px;margin:0 auto}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:0}h3{font-size:15px;margin:16px 0 4px}.muted{color:var(--muted)}
table{border-collapse:collapse;width:100%;margin:16px 0 32px}td,th{border-bottom:1px solid var(--line);padding:8px;text-align:left}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
figure{margin:0}img,video{width:100%;border:1px solid var(--line);border-radius:6px;background:#000}video{grid-column:1/-1;max-height:560px}
.noshot{border:1px dashed var(--line);border-radius:6px;padding:40px 0;text-align:center;color:var(--muted)}figcaption{font-size:13px;padding-top:6px}.miss{color:var(--fail)}.note{color:var(--muted)}.handoff{color:var(--todo)}
.v{font-size:12px;font-weight:600;padding:1px 8px;border-radius:99px;border:1px solid currentColor}.pass{color:var(--pass)}.partial{color:var(--partial)}.fail{color:var(--fail)}.info{color:var(--info)}.todo{color:var(--todo)}
.tag{font-size:12px;padding:1px 6px;border-radius:4px;border:1px dashed var(--muted);color:var(--muted)}.tag.human{border-style:solid;color:var(--todo)}
.warn{background:var(--warn-bg);color:var(--warn-fg);border-radius:8px;padding:10px 14px;margin:0 0 16px}
.plan{font-size:13px;margin:0 0 12px}ul.plan,.plan ul{padding-left:18px}.plan li{margin:4px 0}
a{color:inherit}.todo-list{padding-left:18px;margin:4px 0 12px}.todo-list li{margin:4px 0}</style></head><body><main>
${warn.map(w => `<div class="warn">${w}</div>`).join('')}
<h1>${esc(run.title || '검수 결과')}</h1><p class="muted">기준 ${esc(run.base || checklist.base)} · 서버 ${esc(run.server || checklist.server)} · 생성 ${new Date().toLocaleString('ko-KR')}</p>
<p>${summary}</p>
<p class="muted">판정은 화면 문구 자동 대조 결과입니다. 빨간 테두리가 확인한 문구 위치입니다. 최종 판정은 사진과 영상으로 해 주세요. 부분 = 통과한 확인과 직접 확인할 항목이 섞인 티켓입니다.</p>
${todo ? `<h2>직접 확인할 것</h2>${todo}` : `<p>${badge('pass')} 직접 확인할 항목이 없습니다.</p>`}
<table><tr><th>TC</th><th>티켓</th><th>앱</th><th>내용</th><th>1차 판정</th></tr>${rows}</table>${cards}</main></body></html>`;
fs.mkdirSync(path.join(Q, 'report'), { recursive: true });
fs.writeFileSync(path.join(Q, 'report', 'index.html'), html);
if (template) console.warn('경고: checklist.json 이 템플릿(PROJ-0000) 그대로입니다. 모든 결과가 checklist 밖으로 붙습니다.');
if (broken.length) console.warn(`경고: 읽지 못한 결과 ${broken.length}건`);
console.log('report:', path.join(Q, 'report', 'index.html'), 'results:', results.length,
  '티켓:', groups.length, Object.entries(count).map(([v, n]) => `${label[v]} ${n}`).join(' · '));
