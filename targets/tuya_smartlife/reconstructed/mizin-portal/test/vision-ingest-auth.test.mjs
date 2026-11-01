import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyIngestToken} from '../vision-ingest-auth.mjs';

test('accepts only the exact token', () => {
  assert.equal(verifyIngestToken('abc123', 'abc123'), true);
  assert.equal(verifyIngestToken('abc124', 'abc123'), false);
  assert.equal(verifyIngestToken('abc12', 'abc123'), false);
  assert.equal(verifyIngestToken('abc1234', 'abc123'), false);
});

test('rejects missing, empty or non-string input without throwing', () => {
  assert.equal(verifyIngestToken(undefined, 'abc123'), false);
  assert.equal(verifyIngestToken(null, 'abc123'), false);
  assert.equal(verifyIngestToken('', 'abc123'), false);
  assert.equal(verifyIngestToken(['abc123'], 'abc123'), false);
  assert.equal(verifyIngestToken('abc123', ''), false);
  assert.equal(verifyIngestToken('abc123', undefined), false);
});

test('is not fooled by prototype pollution or object-shaped headers', () => {
  assert.equal(verifyIngestToken({toString: () => 'abc123'}, 'abc123'), false);
});
