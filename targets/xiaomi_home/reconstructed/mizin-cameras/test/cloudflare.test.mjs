import test from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../cloudflare/gateway.mjs';
import pages from '../cloudflare/pages.mjs';
test('gateway blocks other origins and local invitation routes without contacting the central',async()=>{
  const env={CENTRAL:{fetch(){throw new Error('must not be called');}},GATEWAY_TOKEN:'private'};
  assert.equal((await gateway.fetch(new Request('https://evil.test/api/cameras'),env)).status,403);
  assert.equal((await gateway.fetch(new Request('https://homecams.pages.dev/api/local-link',{method:'POST'}),env)).status,404);
  assert.equal((await gateway.fetch(new Request('https://homecams.pages.dev/api/session',{method:'POST',headers:{origin:'https://evil.test'}}),env)).status,403);
});
test('gateway replaces untrusted headers and preserves secure session cookies',async()=>{
  let seen;
  const env={GATEWAY_TOKEN:'server-private-value',CENTRAL:{async fetch(url,options){seen={url,options};return new Response('ok',{headers:{'set-cookie':'mizin_camera=example; Secure; HttpOnly'}});}}};
  const r=await gateway.fetch(new Request('https://homecams.pages.dev/api/cameras',{headers:{'x-mizin-gateway':'attacker','x-forwarded-for':'attacker',cookie:'session'}}),env);
  assert.equal(seen.url,'http://homecams.pages.dev/api/cameras');assert.equal(seen.options.headers.get('x-mizin-gateway'),'server-private-value');assert.equal(seen.options.headers.get('x-forwarded-for'),null);assert.ok(r.headers.get('set-cookie').includes('Secure'));
});
test('Pages preview origins cannot invoke production APIs',async()=>{assert.equal((await pages.fetch(new Request('https://preview.homecams.pages.dev/api/cameras'),{})).status,403);});
