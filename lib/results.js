// 실행 폴더의 checklist.json 과 results/*.json 을 읽어 티켓(=TC)별로 묶고 판정한다. report.js · tc-results.js 가 함께 쓴다.
// 옛 형식 호환: checklist expect 문자열, 결과의 tc 없음·문자열·{id,...}, check 의 reason 없음.
const fs = require('fs');
const path = require('path');

// check 의 reason(info·fail 사유). 순서는 보고서 "직접 확인할 것"의 묶음 순서다.
const REASONS = {
  'human-judge': '사람 판정',
  'blocked-write': '데이터 변경이라 실행 안 함',
  'wait-time': '시각 대기',
  env: '환경 문제',
  record: '기록용 촬영',
};
const UNCLASSIFIED = '사유 미분류';

// 티켓 판정 라벨. todo = 결과 없음(미실행).
const VERDICT = { pass: '통과', partial: '부분', info: '참고', fail: '실패', todo: '미실행' };

const asList = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);

// tc 정규화: 문자열 → {id}, id 없는 객체·빈 값 → null
function tcOf(x) {
  if (!x) return null;
  if (typeof x === 'string') return { id: x };
  return typeof x === 'object' && x.id ? x : null;
}

const isTemplateTicket = t => /^PROJ-0000$/.test(t || '');
// 템플릿을 그대로 둔 checklist: 항목이 없거나 모두 PROJ-0000
const isTemplate = checklist => !(checklist.items || []).some(i => !isTemplateTicket(i.ticket));

// fail 하나라도 → 실패 / 모두 pass → 통과 / pass + info → 부분 / 모두 info → 참고 / 결과 없음 → 미실행
// pass·fail 이 아닌 값(info, 사람이 note 로 적은 다른 값)은 info 로 본다.
function ticketVerdict(checks) {
  if (!checks.length) return 'todo';
  if (checks.some(c => c.verdict === 'fail')) return 'fail';
  const pass = checks.filter(c => c.verdict === 'pass').length;
  return pass === checks.length ? 'pass' : pass ? 'partial' : 'info';
}

// 결과 check 의 사유. 기록된 reason 이 먼저이고, 없으면 checklist 의 kit B(사람 판정)에서 채운다.
function reasonOf(c, meta) {
  if (c.reason) return c.reason;
  if (c.verdict === 'info' && meta && meta.kit === 'B') return 'human-judge';
  return null;
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function loadRun(Q, proj = null) {
  const clPath = path.join(Q, 'checklist.json');
  const checklist = fs.existsSync(clPath) ? readJson(clPath) : { items: [] };
  checklist.items ||= [];
  const resDir = path.join(Q, 'results');
  const results = [];
  const broken = [];
  if (fs.existsSync(resDir)) for (const f of fs.readdirSync(resDir).filter(f => f.endsWith('.json')).sort()) {
    try { const r = readJson(path.join(resDir, f)); r.checks ||= []; r._file = f; results.push(r); } catch (e) { broken.push(`${f}: ${e.message}`); }
  }
  const template = isTemplate(checklist);
  const items = checklist.items.filter(i => !isTemplateTicket(i.ticket));

  // 결과를 checklist 항목에 붙인다. 같은 티켓(=TC)에 앱별 항목이 여럿이면 앱으로 가른다.
  // 결과의 app 은 시나리오가 정한 이름(예: vue-app)이고 checklist app 은 앱 키(ctv) 또는 표시명이라 project.json repo 로도 맞춘다.
  const repoOf = key => (proj && proj.apps && proj.apps[key] && proj.apps[key].repo) || '';
  const sameApp = (item, r) => {
    const a = String(item.app || ''), ra = String(r.app || '');
    if (!ra) return false;
    const repo = repoOf(a);
    return a === ra || a.includes(`(${ra})`) || repo === ra || repo.endsWith(`-${ra}`);
  };
  const groups = items.map(item => ({ item, results: [], outside: false }));
  const byTicket = {};
  for (const g of groups) (byTicket[g.item.ticket] ||= []).push(g);
  const outside = {};
  for (const r of results) {
    const gs = byTicket[r.ticket];
    if (!gs) { (outside[r.ticket] ||= []).push(r); continue; }
    (gs.length === 1 ? gs[0] : gs.find(g => sameApp(g.item, r)) || gs[0]).results.push(r);
  }
  for (const [ticket, rs] of Object.entries(outside)) {
    groups.push({
      item: { ticket, app: [...new Set(rs.map(r => r.app))].join(', '), title: rs[0].title || '', checks: [] },
      results: rs, outside: true,
    });
  }
  for (const g of groups) {
    g.checks = g.results.flatMap(r => r.checks);
    g.verdict = ticketVerdict(g.checks);
    const metaById = Object.fromEntries((g.item.checks || []).map(c => [c.id, c]));
    g.meta = c => metaById[c.id] || null;
    // TC: 결과에 남긴 tc > checklist 항목의 tc
    const fromResult = g.results.map(r => tcOf(r.tc)).find(Boolean);
    g.tc = fromResult || tcOf(g.item.tc);
    g.tcSource = fromResult ? 'result' : g.tc ? 'checklist' : null;
  }
  return { checklist, items, results, groups, template, broken };
}

// 명세 4절: [{tc, step, app, verdict, reason, note, shot}] · tc 를 결과·checklist 에서 못 찾으면 ticket 을 쓰고 tc_source: "ticket"
function tcResults(data) {
  const rows = [];
  for (const g of data.groups) for (const r of g.results) {
    const rtc = tcOf(r.tc);
    const tc = rtc || tcOf(g.item.tc);
    for (const c of r.checks) {
      const row = {
        tc: tc ? tc.id : r.ticket, step: c.id, app: r.app, verdict: c.verdict,
        reason: reasonOf(c, g.meta(c)), note: c.note || '', shot: c.shot || null,
      };
      if (!tc) row.tc_source = 'ticket';
      else if (!rtc) row.tc_source = 'checklist';
      rows.push(row);
    }
  }
  return rows.sort((a, b) => String(a.tc).localeCompare(String(b.tc)) || String(a.step).localeCompare(String(b.step), 'en', { numeric: true }) || String(a.app).localeCompare(String(b.app)));
}

module.exports = { REASONS, UNCLASSIFIED, VERDICT, asList, tcOf, isTemplate, ticketVerdict, reasonOf, loadRun, tcResults };
