// 실행 폴더(run)와 프로젝트 설정을 읽는다.
// run 폴더: QA_RUN 환경변수. 안에 run.json(프로젝트·회차)과 checklist.json이 있고 결과(shots/videos/results/report)가 쌓인다.
// 프로젝트 설정: projects/<project>/project.json. 계정 파일은 저장소 밖 경로만 가리킨다.
const fs = require('fs');
const path = require('path');

const KIT = path.resolve(__dirname, '..');

function expand(p) { return p && p.replace(/^~(?=\/|$)/, process.env.HOME).replace(/\$\{?HOME\}?/g, process.env.HOME); }

function runDir() {
  const r = process.env.QA_RUN;
  if (!r) throw new Error('QA_RUN 이 없습니다. `bin/qa new <project> <round>` 로 만든 실행 폴더를 지정하십시오.');
  return path.resolve(expand(r));
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function run() { return readJson(path.join(runDir(), 'run.json')); }

function project(name = run().project) { return readJson(path.join(KIT, 'projects', name, 'project.json')); }

// KEY=value 형식 계정 파일. 값은 로그에 찍지 않는다.
function accounts(proj = project()) {
  const f = expand(proj.accountsEnv || '');
  if (!f || !fs.existsSync(f)) return {};
  return Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^'|'$/g, '')]; }));
}

module.exports = { KIT, expand, runDir, run, project, accounts, readJson };
