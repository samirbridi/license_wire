// Bounded, read-only reachability probe for the owner's explicitly supplied IP.
// No application payload, authentication, multicast discovery or vehicle command.
import { Socket } from 'node:net';
import { networkInterfaces } from 'node:os';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = dirname(dirname(fileURLToPath(import.meta.url)));
const host = '192.168.1.119';
const ports = [22, 80, 443, 554, 3000, 5000, 5001, 5555, 7000, 8000, 8008, 8009, 8080, 8081, 8443, 8888, 9000, 9090];
const timeoutMs = 1500;
const concurrency = 4;
const timestamp = new Date().toISOString();
const evidence = {
  schema: 'gwm-lan-probe/v1', timestamp, host,
  vehicle: { model: 'GWM ORA 5', modelYear: '2026/2027', headUnitReportedByOwner: 'Coffee OS 3', parkedInPAndPoweredOnReportedByOwner: true },
  interfaces: Object.entries(networkInterfaces()).flatMap(([name, values]) => values.filter(a => a.family === 'IPv4' && !a.internal).map(a => ({ name, address: a.address, netmask: a.netmask }))),
  scope: { hosts: [host], ports, timeoutMs, concurrency, tcpApplicationPayloadSent: false, authenticationAttempted: false, multicastDiscovery: false, vehicleCommandsSent: false, vehicleConfigurationWritten: false },
};
const pingCode = '$p=New-Object System.Net.NetworkInformation.Ping; $items=@(); 1..2 | ForEach-Object { try { $r=$p.Send("192.168.1.119",1200); $ttl=$null; if ($r.Options) {$ttl=$r.Options.Ttl}; $items += [pscustomobject]@{status=$r.Status.ToString();roundtripMs=$r.RoundtripTime;ttl=$ttl} } catch { $items += [pscustomobject]@{error=$_.Exception.Message} } }; $p.Dispose(); ConvertTo-Json -InputObject $items -Compress';
try {
  evidence.icmp = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', pingCode], { encoding: 'utf8', timeout: 10000, windowsHide: true }));
} catch (error) { evidence.icmpError = { code: error.code ?? null, message: error.message }; }

const probe = port => new Promise(resolve => {
  const socket = new Socket();
  const started = performance.now();
  let finished = false;
  const finish = (status, code) => {
    if (finished) return;
    finished = true;
    socket.destroy();
    resolve({ port, status, ...(code ? { code } : {}), elapsedMs: Math.round(performance.now() - started) });
  };
  socket.setTimeout(timeoutMs);
  socket.once('connect', () => finish('open'));
  socket.once('timeout', () => finish('timeout'));
  socket.once('error', error => finish(error.code === 'ECONNREFUSED' ? 'refused' : 'error', error.code));
  socket.connect(port, host);
});
evidence.tcp = [];
for (let i = 0; i < ports.length; i += concurrency) evidence.tcp.push(...await Promise.all(ports.slice(i, i + concurrency).map(probe)));
try {
  const arp = execFileSync('arp.exe', ['-a', host], { timeout: 5000, windowsHide: true });
  evidence.arpRawBase64 = arp.toString('base64');
  evidence.arpRawEncoding = 'Windows OEM codepage';
  evidence.mac = arp.toString('ascii').match(/192\.168\.1\.119\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})/i)?.[1]?.toUpperCase().replaceAll('-', ':') ?? null;
} catch (error) { evidence.arpError = { code: error.code ?? null, message: error.message }; }
evidence.completedAt = new Date().toISOString();
const output = join(target, 'evidence', `lan-probe-${timestamp.replaceAll(':', '-')}.json`);
writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, timestamp, host, icmp: evidence.icmp, mac: evidence.mac, tcp: evidence.tcp, errors: { icmp: evidence.icmpError, arp: evidence.arpError } }, null, 2));
