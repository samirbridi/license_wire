// Release metadata for this isolated target, derived exclusively from Git commits.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = dirname(dirname(fileURLToPath(import.meta.url)));
let gitDirectory = target;
const git = (...args) => execFileSync('git', args, { cwd: gitDirectory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const root = git('rev-parse', '--show-toplevel');
gitDirectory = root;
const targetPath = relative(root, target).replaceAll('\\', '/');
const versionPath = `${targetPath}/VERSION`;
const previous = readFileSync(join(target, 'VERSION'), 'utf8').trim();
const parsed = /^v(\d+)\.(\d+)\.(\d+) \(build (\d+)\)$/.exec(previous);
if (!parsed) throw new Error('Unsupported VERSION format');
const baseline = git('log', '-1', '--format=%H', '--', versionPath);
if (!baseline) throw new Error('VERSION needs a committed release baseline');
const dirty = git('status', '--porcelain=v1', '--', targetPath);
if (dirty) throw new Error('Commit target changes before computing release metadata');
const log = git('log', '--reverse', '--format=%H%x1f%s%x1f%b%x1e', `${baseline}..HEAD`, '--', targetPath);
const commits = log.split('\x1e').map(value => value.trim()).filter(Boolean).map(value => {
  const [hash, subject, body = ''] = value.split('\x1f');
  const match = /^(feat|fix|improve|perf|refactor|break):\s+(.+)$/.exec(subject);
  if (!match) throw new Error(`Nonconforming commit: ${hash} ${subject}`);
  return { hash, subject, type: match[1], breaking: match[1] === 'break' || /\bBREAKING CHANGE\b/.test(body) };
});
if (!commits.length) throw new Error('No target commits since last release');
let [major, minor, patch, build] = parsed.slice(1).map(Number);
const increment = commits.some(c => c.breaking) ? 'break' : commits.some(c => c.type === 'feat') ? 'feat' : 'fix';
if (increment === 'break') { major++; minor = 0; patch = 0; }
else if (increment === 'feat') { minor++; patch = 0; }
else patch++;
build++;
const version = `v${major}.${minor}.${patch} (build ${String(build).padStart(4, '0')})`;
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const categories = [
  ['💥 Breaking Changes', c => c.breaking],
  ['✨ Features', c => !c.breaking && c.type === 'feat'],
  ['🐛 Fixes', c => !c.breaking && c.type === 'fix'],
  ['⚡ Improvements', c => !c.breaking && ['improve', 'perf', 'refactor'].includes(c.type)],
];
const entry = `## ${version} - ${date}\n\n` + categories.map(([title, predicate]) => {
  const lines = commits.filter(predicate).map(c => `- ${c.subject} (commit \`${c.hash}\`)`);
  return `### ${title}\n\n${lines.length ? lines.join('\n') : '- Nenhum.'}\n`;
}).join('\n') + '\n';
const receipt = { previous, version, date, timezone: 'America/Sao_Paulo', baseline, sourceHead: git('rev-parse', 'HEAD'), increment, commits };
if (process.argv.includes('--write')) {
  const changelogFile = join(target, 'CHANGELOG.md');
  const changelog = readFileSync(changelogFile, 'utf8');
  const heading = /^(# [^\r\n]+\r?\n\r?\n)/.exec(changelog);
  if (!heading) throw new Error('Expected changelog heading');
  const readmeFile = join(target, 'README.md');
  const readme = readFileSync(readmeFile, 'utf8');
  if (!/> \*\*Versão da Análise\*\*: `[^`]+`/.test(readme)) throw new Error('Expected README version field');
  writeFileSync(join(target, 'VERSION'), `${version}\n`);
  writeFileSync(changelogFile, heading[0] + entry + changelog.slice(heading[0].length));
  writeFileSync(readmeFile, readme.replace(/(> \*\*Versão da Análise\*\*: `)[^`]+(`)/, `$1${version}$2`));
  writeFileSync(join(target, 'evidence', `release-build-${String(build).padStart(4, '0')}.json`), JSON.stringify(receipt, null, 2) + '\n');
}
console.log(JSON.stringify(receipt, null, 2));
