// <run>/results/*.json + checklist.json → <run>/report/index.html (사진·영상은 상대 경로로 참조)
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const Q = cfg.runDir();
const run = cfg.run();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const checklist = JSON.parse(fs.readFileSync(path.join(Q, 'checklist.json'), 'utf8'));
const resDir = path.join(Q, 'results');
const results = fs.existsSync(resDir) ? fs.readdirSync(resDir).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(resDir, f), 'utf8'))) : [];
const byTicket = {};
for (const r of results) (byTicket[r.ticket] ||= []).push(r);

const label = { pass: '통과', fail: '실패', info: '참고', todo: '미검수' };
let rows = '', cards = '', todo = '';
// 체크리스트에 없는 티켓의 결과도 빠뜨리지 않는다(맨 뒤에 붙임)
const listed = new Set(checklist.items.map(i => i.ticket));
const items = [...checklist.items.filter(i => !/^PROJ-0000$/.test(i.ticket)),
  ...Object.values(byTicket).filter(rs => !listed.has(rs[0].ticket)).map(rs => ({ ticket: rs[0].ticket, app: rs.map(r => r.app).join(', '), title: `${rs[0].title || ''} (체크리스트 밖)`, checks: [] }))];
for (const item of items) {
  const rs = byTicket[item.ticket] || [];
  const checks = rs.flatMap(r => r.checks);
  const verdict = !rs.length ? 'todo' : checks.some(c => c.verdict === 'fail') ? 'fail' : 'pass';
  rows += `<tr><td><a href="#${item.ticket}">${item.ticket}</a></td><td>${esc(item.app)}</td><td>${esc(item.title)}</td><td><span class="v ${verdict}">${label[verdict]}</span></td></tr>`;
  let body = '';
  for (const r of rs) {
    if (r.video) body += `<video controls preload="metadata" src="../${r.video}"></video>`;
    if (r.hosts?.length) body += `<p class="muted" style="grid-column:1/-1;margin:0">요청 서버: ${r.hosts.map(esc).join(', ')}</p>`;
    for (const c of r.checks) {
      const miss = [...(c.expect || []).filter(x => !x.ok).map(x => `없음: ${x.text}`), ...(c.absent || []).filter(x => !x.ok).map(x => `남아 있음: ${x.text}`)];
      const want = [...(c.expect || []).map(x => x.text), ...(c.absent || []).map(x => `(없어야 함) ${x.text}`)];
      body += `<figure>${c.shot ? `<a href="../${c.shot}" target="_blank"><img loading="lazy" src="../${c.shot}"></a>` : '<div class="noshot">사진 없음</div>'}<figcaption>
        <span class="v ${c.verdict}">${label[c.verdict]}</span> <b>${esc(c.screen || c.id)}</b>
        ${want.length ? `<div>확인 문구: ${want.map(esc).join(', ')}</div>` : ''}
        ${miss.length ? `<div class="miss">${miss.map(esc).join('<br>')}</div>` : ''}
        ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}</figcaption></figure>`;
    }
    if (r.errors?.length) body += `<details><summary>페이지 오류 ${r.errors.length}건</summary><pre>${esc(r.errors.join('\n'))}</pre></details>`;
  }
  for (const c of checks.filter(c => c.verdict !== 'pass'))
    todo += `<li><a href="#${item.ticket}">${item.ticket}</a> <span class="v ${c.verdict}">${label[c.verdict]}</span> ${esc(c.screen || c.id)}${c.note ? ` — <span class="muted">${esc(c.note)}</span>` : ''}</li>`;
  if (!rs.length) todo += `<li><a href="#${item.ticket}">${item.ticket}</a> <span class="v todo">${label.todo}</span> ${esc(item.title)}</li>`;
  if (!rs.length) body = `<p class="muted">아직 촬영하지 않았습니다. 확인 예정: ${item.checks.map(c => esc(c.screen)).join(', ')}</p>`;
  cards += `<section id="${item.ticket}"><h2>${item.ticket} · ${esc(item.app)}</h2><p>${esc(item.title)}</p><div class="grid">${body}</div></section>`;
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(run.title || '검수 결과')}</title><style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--card:#fff;--pass:#15803d;--fail:#b91c1c;--info:#1d4ed8;--todo:#a16207}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--line:#44403c;--card:#292524;--pass:#4ade80;--fail:#f87171;--info:#93c5fd;--todo:#facc15}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:1200px;margin:0 auto}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:0}.muted{color:var(--muted)}
table{border-collapse:collapse;width:100%;margin:16px 0 32px}td,th{border-bottom:1px solid var(--line);padding:8px;text-align:left}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
figure{margin:0}img,video{width:100%;border:1px solid var(--line);border-radius:6px;background:#000}video{grid-column:1/-1;max-height:560px}
.noshot{border:1px dashed var(--line);border-radius:6px;padding:40px 0;text-align:center;color:var(--muted)}figcaption{font-size:13px;padding-top:6px}.miss{color:var(--fail)}.note{color:var(--muted)}
.v{font-size:12px;font-weight:600;padding:1px 8px;border-radius:99px;border:1px solid currentColor}.pass{color:var(--pass)}.fail{color:var(--fail)}.info{color:var(--info)}.todo{color:var(--todo)}
a{color:inherit}.todo-list{padding-left:18px;margin:8px 0 24px}.todo-list li{margin:4px 0}</style></head><body><main>
<h1>${esc(run.title || '검수 결과')}</h1><p class="muted">기준 ${esc(run.base || checklist.base)} · 서버 ${esc(run.server || checklist.server)} · 생성 ${new Date().toLocaleString('ko-KR')}</p>
<p class="muted">판정은 화면 문구 자동 대조 결과입니다. 빨간 테두리가 확인한 문구 위치입니다. 최종 판정은 사진과 영상으로 해 주세요.</p>
${todo ? `<h2>직접 확인할 것</h2><ul class="todo-list">${todo}</ul>` : '<p><span class="v pass">통과</span> 직접 확인할 항목이 없습니다.</p>'}
<table><tr><th>티켓</th><th>앱</th><th>내용</th><th>1차 판정</th></tr>${rows}</table>${cards}</main></body></html>`;
fs.mkdirSync(path.join(Q, 'report'), { recursive: true });
fs.writeFileSync(path.join(Q, 'report', 'index.html'), html);
console.log('report:', path.join(Q, 'report', 'index.html'), 'results:', results.length);
