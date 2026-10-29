# usage: QA_RUN=<run> python3 note.py <app> <ticket> <check-id> <verdict> "<note>" [--reason <reason>]
# 자동 판정에 사람이 확인한 판정·사유를 붙인다. reason(info·fail 사유): human-judge · blocked-write · wait-time · env · record
# pass 로 바꾸면 reason 을 지운다. --reason 을 주지 않으면 기존 reason 을 그대로 둔다.
import sys, json, os
REASONS = ('human-judge', 'blocked-write', 'wait-time', 'env', 'record')
args = sys.argv[1:]
reason = None
if '--reason' in args:
    i = args.index('--reason')
    if i + 1 >= len(args): sys.exit('--reason 값이 없습니다')
    reason = args[i + 1]; del args[i:i + 2]
    if reason not in REASONS: sys.exit(f'알 수 없는 reason: {reason} ({", ".join(REASONS)})')
if len(args) < 5: sys.exit('usage: qa note <app> <ticket> <check-id> <verdict> "<사유>" [--reason <reason>]')
app, ticket, cid, verdict, note = args[:5]
p = os.path.join(os.environ['QA_RUN'], 'results', f'{app}-{ticket}.json'); r = json.load(open(p))
hit = 0
for c in r['checks']:
    if c['id'] == cid:
        hit += 1; c['verdict'] = verdict; c['note'] = note
        if verdict == 'pass': c.pop('reason', None)
        elif reason: c['reason'] = reason
if not hit: sys.exit(f'check 없음: {cid} ({p})')
json.dump(r, open(p, 'w'), ensure_ascii=False, indent=2); print('ok', cid, verdict, reason or '')
