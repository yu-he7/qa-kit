// <run>/results/*.json → TC 단계별 결과 JSON [{tc, step, app, verdict, reason, note, shot}] (여정형 TC 공통 명세 4절)
// usage: QA_RUN=<run> node lib/tc-results.js [--out <file>]   (--out 이 없으면 표준 출력)
// 사람 시트로는 cmb-itest-plan collect_results.py --kit 이 "자동화 제안" 열로만 옮긴다. 사람 판정이 먼저다.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { loadRun, tcResults } = require('./results');

const args = process.argv.slice(2);
const i = args.indexOf('--out');
const out = i >= 0 ? args[i + 1] : null;
if (i >= 0 && !out) { console.error('usage: qa tc-results [--out <file>]'); process.exit(2); }

let proj = null; try { proj = cfg.project(); } catch {}
const data = loadRun(cfg.runDir(), proj);
const rows = tcResults(data);
const json = JSON.stringify(rows, null, 2) + '\n';
if (data.template) console.error('경고: checklist.json 이 템플릿(PROJ-0000) 그대로입니다. checklist 의 tc 를 쓸 수 없어 결과의 tc 또는 ticket 만 씁니다.');
if (data.broken.length) console.error(`경고: 읽지 못한 결과 ${data.broken.length}건`);
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, json);
  const bySource = rows.reduce((m, r) => (m[r.tc_source || 'result'] = (m[r.tc_source || 'result'] || 0) + 1, m), {});
  console.error(`tc-results: ${out} 단계 ${rows.length}건 · TC ${new Set(rows.map(r => r.tc)).size}개 · tc 출처 ${JSON.stringify(bySource)}`);
} else process.stdout.write(json);
