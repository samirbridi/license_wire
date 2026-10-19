"""Generate target version/changelog from actual scoped Git commits, not a chosen type."""
import argparse
import datetime
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
TARGET = ROOT.relative_to(REPO).as_posix()
TYPES = ('break', 'feat', 'fix', 'improve', 'perf', 'refactor')


def git(*args):
    return subprocess.check_output(['git', '-C', str(REPO), *args], text=True, encoding='utf-8').rstrip('\r\n')


def increment(version, kind):
    match = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+) \(build (\d+)\)', version)
    if not match:
        raise ValueError('Invalid VERSION: ' + version)
    major, minor, patch, build = map(int, match.groups())
    if kind == 'break':
        major += 1; minor = patch = 0
    elif kind == 'feat':
        minor += 1; patch = 0
    else:
        patch += 1
    return f'v{major}.{minor}.{patch} (build {build + 1:04d})'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reserve', action='store_true')
    parser.add_argument('--status', choices=['PASS', 'FAIL'])
    args = parser.parse_args()
    state_path = ROOT / 'evidence/version-state.json'
    build_path = ROOT / 'evidence/build-version.json'
    history_path = ROOT / 'evidence/build-history.json'
    if args.status:
        state = json.loads(build_path.read_text(encoding='utf-8'))
        state['build_status'] = args.status
        build_path.write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')
        history = json.loads(history_path.read_text(encoding='utf-8'))
        history[-1]['build_status'] = args.status
        history_path.write_text(json.dumps(history, indent=2) + '\n', encoding='utf-8')
        return
    state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() else {}
    last = state.get('source_commit')
    current = git('rev-parse', 'HEAD')
    revision = f'{last}..HEAD' if last else 'HEAD'
    raw = git('log', '--reverse', '--format=%H%x1f%s%x1f%b%x1e', revision, '--', TARGET)
    commits = []
    for record in raw.split('\x1e'):
        if not record.strip():
            continue
        sha, subject, body = record.strip('\r\n').split('\x1f', 2)
        match = re.fullmatch(r'(break|feat|fix|improve|perf|refactor): (.+)', subject)
        if not match:
            raise ValueError('Non-conforming target commit: ' + sha + ' ' + subject)
        kind = 'break' if 'BREAKING CHANGE' in body or match[1] == 'break' else match[1]
        commits.append({'sha': sha, 'subject': subject, 'kind': kind})
    if not commits and not last:
        raise ValueError('Commit the target source before its first compilation')
    kind = 'break' if any(c['kind'] == 'break' for c in commits) else 'feat' if any(c['kind'] == 'feat' for c in commits) else 'fix'
    previous = (ROOT / 'VERSION').read_text(encoding='utf-8-sig').strip()
    display = increment(previous, kind)
    result = {'display': display, 'previous': previous, 'source_commit': current, 'commits': commits,
              'date': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).date().isoformat(),
              'build_status': 'RESERVED'}
    if args.reserve:
        dirty = git('status', '--porcelain', '--untracked-files=normal', '--', TARGET + '/reconstructed', TARGET + '/scripts')
        if dirty:
            raise ValueError('Commit source changes before compilation:\n' + dirty)
        (ROOT / 'VERSION').write_text(display + '\n', encoding='utf-8')
        build_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        state_path.write_text(json.dumps({'source_commit': current, 'display': display}, indent=2) + '\n', encoding='utf-8')
        history = json.loads(history_path.read_text(encoding='utf-8')) if history_path.exists() else []
        history.append(result)
        history_path.write_text(json.dumps(history, indent=2) + '\n', encoding='utf-8')
        sections = [('💥 Breaking Changes', ('break',)), ('✨ Features', ('feat',)), ('🐛 Fixes', ('fix',)), ('⚡ Improvements', ('improve', 'perf', 'refactor'))]
        text = f'## {display} - {result["date"]}\n\n'
        for title, kinds in sections:
            entries = [f'- {c["subject"]} ({c["sha"]})' for c in commits if c['kind'] in kinds]
            if not commits and 'fix' in kinds:
                entries = [f'- Recompile at source commit {current}; build counter advanced.']
            text += '### ' + title + '\n' + ('\n'.join(entries) if entries else '- None.') + '\n\n'
        path = ROOT / 'CHANGELOG.md'
        existing = path.read_text(encoding='utf-8-sig')
        path.write_text('# CHANGELOG — ffplayout\n\n' + text + existing.partition('\n')[2].lstrip(), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=True))


if __name__ == '__main__':
    main()
