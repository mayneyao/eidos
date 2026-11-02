// Plain HTTP counterpart to node-transfer-progress.mjs; real native SDK + remote.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
assert(process.argv[2], 'Pass the installed app resources directory');
assert(!process.env.GRAFT_SDK_NATIVE_PATH && !process.env.EIDOS_LITE_GRAFT_SDK_PATH);
const installedRequire = createRequire(join(process.argv[2], 'app.asar', 'package.json'));
const { RepositorySession, sdkVersion } = installedRequire('@eidos.space/graft');
assert.equal(sdkVersion(), '0.3.38-sync-progress.20261103.1');
const directory = mkdtempSync(join(tmpdir(), 'graft-plain-progress-'));
const fixture = join(directory, 'fixture.json');
writeFileSync(fixture, JSON.stringify({ objects: [], serviceLifetimeMs: 180000 }));
const service = spawn(process.execPath, ['tests/e2ee/remote-service.mjs', fixture, join(directory, 'capture.json')], { stdio: ['ignore', 'pipe', 'inherit'] });
const lines = createInterface({ input: service.stdout });
const ready = JSON.parse((await once(lines, 'line'))[0]);
const url = ready.url.replace('http://', 'graft+http://');
const sourcePath = join(directory, 'source'); const peerPath = join(directory, 'peer');
mkdirSync(sourcePath); mkdirSync(peerPath);
const source = await RepositorySession.open(sourcePath); const peer = await RepositorySession.open(peerPath);
const reports = [];
async function observe(label, operation) {
  const stages = []; const transfers = []; let settled = false;
  const start = performance.now();
  await operation(process.env.GRAFT_PROGRESS_SYNC === '0' ? undefined : (event) => {
    assert.equal(settled, false); stages.push(event);
  }, (event) => transfers.push(event));
  settled = true;
  if (process.env.GRAFT_PROGRESS_SYNC !== '0') {
    assert.equal(stages[0]?.phase, 'preparing'); assert.equal(stages.at(-1)?.phase, 'completed');
    assert.ok(stages.some((event) => event.transfer?.transferredBytes > 0));
    assert.ok(stages.some((event) => event.transfer?.totalIsFinal));
    if (['clone', 'pull'].includes(label)) assert.ok(stages.some((event) => event.phase === 'applying'));
    const attempts = new Map();
    for (const { requestId, transfer } of stages) if (transfer) {
      assert.ok(transfer.transferredBytes >= (attempts.get(requestId) ?? 0));
      if (transfer.totalIsFinal) assert.ok(transfer.transferredBytes <= transfer.totalBytes);
      attempts.set(requestId, transfer.transferredBytes);
    }
  }
  const direction = ['clone', 'pull', 'checkout-fetch'].includes(label) ? 'download' : 'upload';
  const planned = transfers.filter((event) => event.direction === direction && event.totalIsFinal);
  assert.ok(planned.length > 0, `${label}: missing complete operation total`);
  assert.equal(new Set(planned.map((event) => event.totalBytes)).size, 1, `${label}: denominator moved`);
  assert.equal(planned.at(-1).transferredBytes, planned.at(-1).totalBytes, `${label}: incomplete transfer plan`);
  reports.push({ label, elapsedMs: Math.round(performance.now() - start), totalBytes: planned.at(-1).totalBytes });
}
try {
  await source.init();
  const db = new DatabaseSync(join(sourcePath, 'records.sqlite'));
  db.exec('CREATE TABLE records(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records VALUES(1, \'first\')'); db.close();
  const payload = randomBytes(1024 * 1024); writeFileSync(join(sourcePath, 'attachment.bin'), payload);
  await source.addAll(); await source.commit('first');
  await source.configureRemote({ name: 'origin', url, bearerToken: 'account-token', upstreamBranch: 'main' });
  await observe('initial-upload', (onSyncProgress, onProgress) => source.push({ onSyncProgress, onProgress }));
  await observe('clone', (onSyncProgress, onProgress) => peer.cloneRepository({ remoteUrl: url, bearerToken: 'account-token', onSyncProgress, onProgress }));
  assert.deepEqual(readFileSync(join(peerPath, 'attachment.bin')), payload);
  const updated = randomBytes(1024 * 1024); writeFileSync(join(sourcePath, 'update.bin'), updated);
  await source.addAll(); await source.commit('second');
  await observe('push', (onSyncProgress, onProgress) => source.push({ onSyncProgress, onProgress }));
  await observe('pull', (onSyncProgress, onProgress) => peer.pull({ onSyncProgress, onProgress }));
  assert.deepEqual(readFileSync(join(peerPath, 'update.bin')), updated);
  const received = new DatabaseSync(join(peerPath, 'records.sqlite'), { readOnly: true });
  assert.equal(received.prepare('SELECT value FROM records').get().value, 'first'); received.close();
  const preparedPath = join(directory, 'prepared'); mkdirSync(preparedPath);
  const prepared = await RepositorySession.open(preparedPath);
  try {
    await prepared.init();
    await prepared.configureRemote({ name: 'origin', url, bearerToken: 'account-token', upstreamBranch: 'main' });
    await observe('checkout-fetch', (onSyncProgress, onProgress) => prepared.fetchForCheckout({ remote: 'origin', branch: 'main', onSyncProgress, onProgress }));
    assert.equal((await prepared.repositoryMetadata()).current_head, null);
    assert.throws(() => readFileSync(join(preparedPath, 'attachment.bin')), { code: 'ENOENT' });
    const plan = await prepared.planMerge({ revision: 'origin/main' });
    await prepared.applyMerge({ revision: 'origin/main', planToken: plan.plan_token });
    assert.deepEqual(readFileSync(join(preparedPath, 'update.bin')), updated);
  } finally { await prepared.close(); }
  console.log(JSON.stringify({ status: 'passed', reports }, null, 2));
} finally {
  await peer.close(); await source.close(); service.kill(); await once(service, 'exit'); lines.close();
  rmSync(directory, { recursive: true, force: true });
}
