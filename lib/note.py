# usage: QA_RUN=<run> python3 note.py <app> <ticket> <check-id> <verdict> "<note>"  — 자동 판정에 사람이 확인한 사유를 붙인다
import sys, json, os
app, ticket, cid, verdict, note = sys.argv[1:6]
p = os.path.join(os.environ['QA_RUN'], 'results', f'{app}-{ticket}.json'); r = json.load(open(p))
for c in r['checks']:
    if c['id'] == cid: c['verdict'] = verdict; c['note'] = note
json.dump(r, open(p, 'w'), ensure_ascii=False, indent=2); print('ok', cid, verdict)
