import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { catalog, digest, fail } from './licensing.mjs';

export function wireManager(store, channelFor = () => null) {
  const db = store.db;
  const lookup = db.prepare("SELECT value FROM config WHERE name='wire-signing-key'");
  if (!lookup.get()) {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    db.prepare("INSERT OR IGNORE INTO config VALUES ('wire-signing-key', ?)").run(pair.privateKey.export({type:'pkcs8',format:'pem'}));
  }
  const privateKey = lookup.get().value;
  const { x, y } = createPublicKey(privateKey).export({format:'jwk'});
  // Windows CNG BCRYPT_ECDSA_PUBLIC_P256_MAGIC followed by the coordinate size, X and Y.
  const publicBlob = Buffer.concat([Buffer.from('4543533120000000','hex'),Buffer.from(x,'base64url'),Buffer.from(y,'base64url')]).toString('base64');
  function library(owner) {
    const rows = [];
    for (const license of store.dashboard(owner)) {
      for (const [product, right] of Object.entries(license.rights)) {
        const item = catalog.products.find(p => p.id === product);
        for (const release of item?.wireReleases ?? []) {
          const published = item.releases[release];
          if (!published || (right.until && published > right.until)) continue;
          rows.push({licenseId:digest(license.serial), product, release, name:item.name, seats:license.seats, used:license.devices.length});
        }
      }
    }
    return rows;
  }
  function grant(owner, data, activate) {
    const license = db.prepare('SELECT serial FROM licenses WHERE owner=?').all(owner).find(l => digest(l.serial) === data.licenseId);
    if (!license) fail('Compra não encontrada nesta conta.',403);
    const token = store.authorize({...data,serial:license.serial},activate,owner);
    const claims = JSON.parse(Buffer.from(token.split('.')[0],'base64url'));
    const channel = channelFor(data.product,data.release);
    const payload = Buffer.from(JSON.stringify({...claims,scope:'mizin-wire',licenseId:data.licenseId,channel})).toString('base64');
    const signature = sign('sha256',Buffer.from(payload),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64');
    return {payload,signature};
  }
  return {publicBlob,library,grant};
}
