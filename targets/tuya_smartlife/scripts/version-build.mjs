import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, rmdirSync, cpSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export function increment(base, commits) {
  const match = /^v(\d+)\.(\d+)\.(\d+) \(build (\d+)\)$/.exec(base.trim());
  if (!match) throw new Error('Invalid VERSION seed');
  let [, major, minor, patch, build] = match.map(Number);
  const types = commits.map(commit => {
    const parsed = /^(feat|fix|improve|perf|refactor|break): (.+)$/.exec(commit.subject);
    if (!parsed) throw new Error('Nonconforming commit: ' + commit.sha);
    return { ...commit, type: parsed[1], description: parsed[2], breaking: parsed[1] === 'break' || /\bBREAKING CHANGE\b/.test(commit.body ?? '') };
  });
  if (types.some(commit => commit.breaking)) { major++; minor = 0; patch = 0; }
  else if (types.some(commit => commit.type === 'feat')) { minor++; patch = 0; }
  else patch++;
  build++;
  return { major, minor, patch, build, display: `v${major}.${minor}.${patch} (build ${String(build).padStart(4, '0')})`, commits: types };
}

export function releaseBaseline(versionFile, stateVersion) {
  const parse = value => {
    const match = /^v(\d+)\.(\d+)\.(\d+) \(build (\d+)\)$/.exec(value.trim());
    if (!match) throw new Error('Invalid release baseline');
    return { value: value.trim(), build: Number(match[4]) };
  };
  const file = parse(versionFile);
  if (!stateVersion) return file.value;
  const state = parse(stateVersion);
  if (file.build === state.build && file.value !== state.value) throw new Error('Conflicting versions for the same build');
  return file.build > state.build ? file.value : state.value;
}

export function release({ target, mode = 'plan', runId = randomUUID() }) {
  const repo = resolve(target, '../..'), scope = relative(repo, target).replaceAll('\\', '/');
  const app = join(target, 'reconstructed/mizin-portal');
  const statePath = join(target, 'release-state.json');
  const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  const generated = path => ['VERSION', 'CHANGELOG.md', 'release-state.json', 'reconstructed/mizin-portal/public/version.json'].includes(path) || /^evidence\/builds\/[^/]+\.json$/.test(path);
  const buildInput = path => path.startsWith('reconstructed/mizin-portal/') && !path.endsWith('/tunnel.json') || ['scripts/version-build.mjs','scripts/prepare-nas-package.py'].includes(path);
  const legacyCursor=existsSync(statePath)?null:git(['log','-1','--format=%H','--',scope+'/VERSION']).trim();
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath,'utf8')) : {sourceCommit:legacyCursor};
  if (mode === 'build' && state?.runId === runId) return state;
  const sourceCommit = git(['rev-parse', 'HEAD']).trim();
  const range = state?.sourceCommit ? `${state.sourceCommit}..${sourceCommit}` : sourceCommit;
  const history = git(['log', '--format=%H%x1f%s%x1f%b%x1e', range, '--', scope]);
  const commits = history.split('\x1e').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const [sha, subject, body] = entry.split('\x1f'); return { sha, subject, body };
  }).filter(commit => {
    const files = git(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', commit.sha]).trim().split('\n').filter(path => path.startsWith(scope + '/'));
    return files.some(path => !generated(path.slice(scope.length + 1)));
  });
  const base = releaseBaseline(readFileSync(join(target, 'VERSION'), 'utf8'), state?.version);
  const next = increment(base, commits);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const result = { runId, sourceCommit, previous: base, version: next.display, build: next.build, date, status: mode === 'plan' ? 'planned' : 'reserved', commits: next.commits };
  if (mode === 'plan') return result;
  if (mode !== 'build') throw new Error('Unknown mode');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(runId)) throw new Error('Invalid run ID');
  const dirty = git(['status', '--porcelain', '--untracked-files=all', '--', scope]).trimEnd();
  if (dirty) {
    const paths = dirty.split('\n').map(line => { let path = line.slice(3).trim(); if (path.startsWith('"')) path = JSON.parse(path); return path.startsWith(scope + '/') ? path.slice(scope.length + 1) : path; });
    if (paths.some(path => !generated(path) && buildInput(path))) throw new Error('Commit target sources before building');
  }
  const lock = join(target, 'runtime/version-build.lock'); mkdirSync(dirname(lock), { recursive: true });
  mkdirSync(lock);
  function atomic(path, data) { const temp = path + '.' + runId + '.tmp'; writeFileSync(temp, data); renameSync(temp, path); }
  try {
    // Reserve before artifact creation. A failed attempt never reuses its number.
    atomic(statePath, JSON.stringify(result, null, 2));
    atomic(join(target, 'VERSION'), next.display + '\n');
    const version = { display: next.display, build: next.build, sourceCommit, date };
    atomic(join(app, 'public/version.json'), JSON.stringify(version, null, 2));
    const sections = [
      ['💥 Breaking Changes', next.commits.filter(c => c.breaking)],
      ['✨ Features', next.commits.filter(c => !c.breaking && c.type === 'feat')],
      ['🐛 Fixes', next.commits.filter(c => !c.breaking && c.type === 'fix')],
      ['⚡ Improvements', next.commits.filter(c => !c.breaking && ['improve', 'perf', 'refactor'].includes(c.type))],
    ];
    let entry = `## ${next.display} - ${date}\n\n`;
    for (const [title, items] of sections) entry += `### ${title}\n\n${items.length ? items.map(c => `- ${c.type}: ${c.description} (commit \`${c.sha}\`)`).join('\n') : '- Nenhum.'}\n\n`;
    if (!next.commits.length) entry += `Recompilação do commit \`${sourceCommit}\`, sem novas alterações de fonte.\n\n`;
    const changelogPath = join(target, 'CHANGELOG.md');
    const prior = readFileSync(changelogPath, 'utf8').replace(/^# [^\n]+\r?\n/, '').trim();
    atomic(changelogPath, '# CHANGELOG — tuya_smartlife\n\n' + entry + prior + '\n');
    const artifact = join(target, 'runtime/builds', 'build-' + String(next.build).padStart(4, '0'));
    mkdirSync(dirname(artifact), { recursive: true });
    mkdirSync(artifact, { recursive: false });
    for (const path of ['server.mjs', 'package.json', 'public']) cpSync(join(app, path), join(artifact, path), { recursive: true, errorOnExist: true, force: false });
    writeFileSync(join(artifact,'public/tunnel.json'),JSON.stringify({mode:'private-gateway'}));
    for (const path of [...readdirSync(app).filter(p=>p.endsWith('.mjs')&&p!=='server.mjs'),'package-lock.json','portal-shell.html','cloudflare','deploy']) if(existsSync(join(app,path)))cpSync(join(app,path),join(artifact,path),{recursive:true,errorOnExist:true,force:false});
    for(const htmlPath of [join(artifact,'public/index.html'),join(artifact,'portal-shell.html')].filter(existsSync))writeFileSync(htmlPath,readFileSync(htmlPath,'utf8').replace(/v\d+\.\d+\.\d+ \(build \d+\)/g,next.display).replace(/v=\d+\.\d+\.\d+-build\d+/g,`v=${next.major}.${next.minor}.${next.patch}-build${String(next.build).padStart(4,'0')}`));
    const packagePath=join(artifact,'package.json'),pkg=JSON.parse(readFileSync(packagePath,'utf8'));pkg.version=`${next.major}.${next.minor}.${next.patch}`;pkg.build=next.build;writeFileSync(packagePath,JSON.stringify(pkg,null,2));
    const lockPath=join(artifact,'package-lock.json');if(existsSync(lockPath)){const lock=JSON.parse(readFileSync(lockPath,'utf8'));lock.version=pkg.version;if(lock.packages?.[''])lock.packages[''].version=pkg.version;writeFileSync(lockPath,JSON.stringify(lock,null,2));}
    result.status = 'built'; result.artifact = relative(target, artifact).replaceAll('\\', '/');
  } catch (error) { result.status = 'failed'; result.error = error.message; throw error; }
  finally {
    atomic(statePath, JSON.stringify(result, null, 2));
    const receipts = join(target, 'evidence/builds'); mkdirSync(receipts, { recursive: true });
    atomic(join(receipts, runId + '.json'), JSON.stringify(result, null, 2));
    rmdirSync(lock);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes('--build') ? 'build' : 'plan';
  const index = process.argv.indexOf('--run-id');
  const target = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = release({ target, mode, ...(index !== -1 ? { runId: process.argv[index + 1] } : {}) });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'failed') process.exitCode = 1;
}
