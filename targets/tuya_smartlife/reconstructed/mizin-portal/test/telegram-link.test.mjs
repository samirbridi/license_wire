import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelegramLinkCodes} from '../telegram-link.mjs';

test('generate() requires an authenticated user and returns an 8-char code from the safe alphabet',()=>{
 const codes=createTelegramLinkCodes();
 assert.throws(()=>codes.generate({}),/autenticado/);
 const {code,expiresAt}=codes.generate({by:'admin@mizin'});
 assert.equal(code.length,6);
 assert.doesNotMatch(code,/[01OIL]/); // ambiguous characters excluded on purpose
 assert.ok(expiresAt>Date.now());
});

test('consume() accepts the exact code once, case-insensitively, then rejects reuse',()=>{
 const codes=createTelegramLinkCodes();
 const {code}=codes.generate({by:'admin@mizin'});
 const entry=codes.consume(code.toLowerCase());
 assert.equal(entry.by,'admin@mizin');
 assert.throws(()=>codes.consume(code),/inválido ou expirado/);
});

test('consume() rejects an unknown or malformed code without throwing a different error type',()=>{
 const codes=createTelegramLinkCodes();
 assert.throws(()=>codes.consume('ZZZZZZ'),/inválido ou expirado/);
 assert.throws(()=>codes.consume(''),/inválido ou expirado/);
 assert.throws(()=>codes.consume(undefined),/inválido ou expirado/);
});

test('a code past its TTL expires on its own and cannot be consumed',()=>{
 let clock=0;
 const codes=createTelegramLinkCodes({ttlMs:60_000,now:()=>clock});
 const {code}=codes.generate({by:'admin@mizin'});
 clock+=60_001;
 assert.throws(()=>codes.consume(code),/inválido ou expirado/);
});

test('two codes generated in the same tick never collide (enough entropy for household use)',()=>{
 const codes=createTelegramLinkCodes();
 const seen=new Set();
 for(let i=0;i<200;i++) seen.add(codes.generate({by:'admin@mizin'}).code);
 assert.equal(seen.size,200);
});
