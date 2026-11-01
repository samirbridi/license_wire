import test from 'node:test';
import assert from 'node:assert/strict';
import {appendActivityLog, resolveLogsLimit, MAX_ACTIVITY_LOGS, DEFAULT_LOGS_FETCH_LIMIT} from '../activity-log.mjs';

test('appendActivityLog keeps newest-first order and never grows past the retention cap',()=>{
 const logs=[];
 for(let i=0;i<5;i++) appendActivityLog(logs,{id:i},3);
 assert.deepEqual(logs.map(l=>l.id),[4,3,2]); // oldest (0,1) dropped first
 assert.equal(logs.length,3);
});

test('appendActivityLog defaults to the real retention cap (5000) when none is passed',()=>{
 const logs=[{id:'old'}];
 appendActivityLog(logs,{id:'new'});
 assert.equal(logs[0].id,'new');
 assert.equal(MAX_ACTIVITY_LOGS,5000);
});

test('resolveLogsLimit falls back to the moderate default for missing or malformed ?limit=',()=>{
 for(const bad of [null,undefined,'','0','-5','abc','NaN'])
  assert.equal(resolveLogsLimit(bad),DEFAULT_LOGS_FETCH_LIMIT);
});

test('resolveLogsLimit honors an explicit, valid ?limit= up to the retention cap',()=>{
 assert.equal(resolveLogsLimit('10'),10);
 assert.equal(resolveLogsLimit('300'),300);
 assert.equal(resolveLogsLimit(String(MAX_ACTIVITY_LOGS)),MAX_ACTIVITY_LOGS);
});

test('resolveLogsLimit clamps a ?limit= above the retention cap instead of pretending more exists',()=>{
 assert.equal(resolveLogsLimit('999999'),MAX_ACTIVITY_LOGS);
});

test('the default fetch limit stays well above the old fixed 100, but below the retention cap',()=>{
 assert.ok(DEFAULT_LOGS_FETCH_LIMIT>100);
 assert.ok(DEFAULT_LOGS_FETCH_LIMIT<MAX_ACTIVITY_LOGS);
});
