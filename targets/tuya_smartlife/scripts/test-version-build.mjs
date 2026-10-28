import test from 'node:test';
import assert from 'node:assert/strict';
import { increment, releaseBaseline } from './version-build.mjs';
const commit = (subject, body = '') => ({ sha: 'a'.repeat(40), subject, body });
test('version metadata ahead of the build journal cannot reuse its number', () => {
  const baseline = releaseBaseline('v0.9.0 (build 0015)', 'v0.8.1 (build 0014)');
  assert.equal(increment(baseline, [commit('feat: leitura SD')]).display, 'v0.10.0 (build 0016)');
  assert.equal(releaseBaseline('v0.8.1 (build 0014)', baseline), baseline);
  assert.throws(() => releaseBaseline('v0.8.1 (build 0014)', 'v0.9.0 (build 0014)'));
});
test('feature increments minor and resets patch', () => assert.equal(increment('v1.2.7 (build 0010)', [commit('feat: nova tela')]).display, 'v1.3.0 (build 0011)'));
test('breaking takes priority over features', () => assert.equal(increment('v1.2.7 (build 0010)', [commit('feat: nova tela'), commit('break: novo protocolo')]).display, 'v2.0.0 (build 0011)'));
test('BREAKING CHANGE body increments major', () => assert.equal(increment('v1.2.7 (build 0010)', [commit('refactor: protocolo', 'BREAKING CHANGE: transporte')]).major, 2));
test('other structured types increment patch', () => { for (const type of ['fix', 'improve', 'perf', 'refactor']) assert.equal(increment('v1.2.7 (build 0010)', [commit(type + ': ajuste')]).display, 'v1.2.8 (build 0011)'); });
test('rebuild increments patch and build without inventing commits', () => { const result = increment('v0.1.0 (build 0001)', []); assert.equal(result.display, 'v0.1.1 (build 0002)'); assert.equal(result.commits.length, 0); });
test('invalid commits and invalid version seed are rejected', () => { assert.throws(() => increment('v1.0.0 (build 0001)', [commit('arbitrary message')])); assert.throws(() => increment('1.0.0', [commit('fix: ajuste')])); });
