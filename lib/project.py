# 프로젝트 설정 읽기: projects/<name>/project.json 위에 개인 설정 project.local.json(있으면)을 덮어쓴다.
# 객체는 키 단위로 합치고, 그 밖의 값(문자열·숫자·배열)은 통째로 바꾼다. lib/config.js 와 같은 규칙이다.
import json, os


def merge(base, over):
    out = dict(base)
    for k, v in over.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load(kit, name):
    d = os.path.join(kit, 'projects', name)
    p = json.load(open(os.path.join(d, 'project.json'), encoding='utf-8'))
    local = os.path.join(d, 'project.local.json')
    return merge(p, json.load(open(local, encoding='utf-8'))) if os.path.exists(local) else p
