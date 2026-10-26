import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { release } from './version-build.mjs';
test('scoped builds are automatic, idempotent and traceable', () => {
  const root = mkdtempSync(join(tmpdir(), 'mizin-version-test-'));
  const target = join(root, 'targets/xiaomi_home'), app = join(target, 'reconstructed/mizin-cameras');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  const save = (path, value) => { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, value); };
  try {
    save(join(target, '.gitignore'), '/runtime/\n'); save(join(target, 'VERSION'), 'v0.1.0 (build 0001)\n');
    save(join(target, 'CHANGELOG.md'), '# CHANGELOG\n\nNotas iniciais.\n');
    save(join(app, 'server.mjs'), 'export const example = true;\n'); save(join(app, 'package.json'), '{}\n'); save(join(app, 'public/index.html'), '<p>test</p>');
    git(['init', '-q']); git(['config', 'user.name', 'Version test']); git(['config', 'user.email', 'version-test@example.invalid']);
    git(['add', '--', 'targets/xiaomi_home']); git(['commit', '-qm', 'feat: cria prototipo de teste']);
    const source = git(['rev-parse', 'HEAD']).trim();
    assert.equal(release({ target }).version, 'v0.2.0 (build 0002)'); assert.equal(existsSync(join(target, 'release-state.json')), false);
    const build = release({ target, mode: 'build', runId: 'unit-build-0002' });
    assert.equal(build.status, 'built'); assert.equal(build.sourceCommit, source);
    assert.equal(release({ target, mode: 'build', runId: 'unit-build-0002' }).build, 2);
    assert.equal(JSON.parse(readFileSync(join(app, 'public/version.json'), 'utf8')).display, readFileSync(join(target, 'VERSION'), 'utf8').trim());
    const changelog = readFileSync(join(target, 'CHANGELOG.md'), 'utf8');
    for (const heading of ['Breaking Changes', 'Features', 'Fixes', 'Improvements']) assert.ok(changelog.includes(heading));
    assert.ok(changelog.includes(source));
    git(['add', '--', 'targets/xiaomi_home']); git(['commit', '-qm', 'improve: registra metadados gerados']);
    save(join(root, 'unrelated.txt'), 'other target'); git(['add', '--', 'unrelated.txt']); git(['commit', '-qm', 'unstructured unrelated commit']);
    const plan = release({ target }); assert.equal(plan.commits.length, 0); assert.equal(plan.version, 'v0.2.1 (build 0003)');
    save(join(target, 'scripts/other-analysis-in-progress.mjs'), '// Other analyst work; not a packaged input.\n');
    assert.equal(release({ target, mode: 'build', runId: 'unit-outside-0003' }).build, 3);
    save(join(app, 'server.mjs'), 'export const example = false;\n');
    assert.throws(() => release({ target, mode: 'build', runId: 'unit-dirty-build' }), /Commit target sources/);
    assert.equal(JSON.parse(readFileSync(join(target, 'release-state.json'), 'utf8')).build, 3);
  } finally {
    const absolute = resolve(root), base = resolve(tmpdir()) + sep;
    if (!absolute.startsWith(base) || !absolute.split(sep).at(-1).startsWith('mizin-version-test-')) throw new Error('Unsafe cleanup');
    rmSync(absolute, { recursive: true, force: true });
  }
});
