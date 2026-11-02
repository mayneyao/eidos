// Exercise file-only Space flows with the shared real-native progress harness.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function exerciseFileOnly({ authority, repository, observed, worktrees, directory, mode }) {
  const sourceAuthority = authority("source");
  const source = await repository("source", sourceAuthority);
  await source.init();
  const first = randomBytes(8 * 1024 * 1024);
  writeFileSync(join(worktrees.get(source), "first.bin"), first);
  await source.addAll();
  await source.commit("file-only initial version");
  const head = (await source.repositoryMetadata()).current_head;
  await sourceAuthority.initializeConfig(Buffer.from("synthetic transfer password"), { branch: "main", commit: head });
  await source.addEncryptedRemote();
  await observed("initial-upload", "upload", (onProgress, onSyncProgress) => source.pushInitialBranch({
    onProgress, onSyncProgress, verificationDirectory: join(directory, `${mode}-verification`),
  }));

  const peerAuthority = authority("peer");
  await peerAuthority.unlock(Buffer.from("synthetic transfer password"));
  const peer = await repository("peer", peerAuthority);
  await observed("clone", "download", (onProgress, onSyncProgress) => peer.cloneEncryptedRemote({ onProgress, onSyncProgress }));
  assert.deepEqual(readFileSync(join(worktrees.get(peer), "first.bin")), first);

  const second = randomBytes(8 * 1024 * 1024);
  writeFileSync(join(worktrees.get(peer), "second.bin"), second);
  await peer.addAll();
  await peer.commit("file-only daily version");
  await observed("push", "upload", (onProgress, onSyncProgress) => peer.push({ onProgress, onSyncProgress }));
  await observed("pull", "download", (onProgress, onSyncProgress) => source.pull({ onProgress, onSyncProgress }));
  assert.deepEqual(readFileSync(join(worktrees.get(source), "first.bin")), first);
  assert.deepEqual(readFileSync(join(worktrees.get(source), "second.bin")), second);

  const third = randomBytes(8 * 1024 * 1024);
  writeFileSync(join(worktrees.get(peer), "third.bin"), third);
  await peer.addAll();
  await peer.commit("file-only reviewed version");
  await peer.push({ onSyncProgress: () => {} });
  const before = (await source.repositoryMetadata()).current_head;
  await observed("checkout-fetch", "download", (onProgress, onSyncProgress) => source.fetchForCheckout({
    remote: "origin", branch: "main", onProgress, onSyncProgress,
  }));
  assert.equal((await source.repositoryMetadata()).current_head, before, "prepared fetch moved HEAD");
  assert.throws(() => readFileSync(join(worktrees.get(source), "third.bin")), { code: "ENOENT" });
  const plan = await source.planMerge({ revision: "origin/main", expectedHead: before });
  await source.applyMerge({ revision: "origin/main", expectedHead: before, planToken: plan.plan_token });
  assert.deepEqual(readFileSync(join(worktrees.get(source), "third.bin")), third);

}

// A real payload-count overflow must keep reporting consumed bytes without
// presenting the retained prefix as a complete operation denominator.
export async function exerciseUploadBudgetOverflow({ authority, repository, observed, worktrees, capture }) {
  const sourceAuthority = authority("overflow");
  const source = await repository("overflow", sourceAuthority);
  await source.init();
  for (let index = 0; index < 260; index++) {
    const bytes = randomBytes(64);
    bytes[0] = 0; // Binary artifacts use external payloads even when small.
    writeFileSync(join(worktrees.get(source), `part-${index}.bin`), bytes);
  }
  await source.addAll();
  await source.commit("synthetic upload inventory overflow");
  const head = (await source.repositoryMetadata()).current_head;
  await sourceAuthority.initializeConfig(Buffer.from("synthetic transfer password"), { branch: "main", commit: head });
  await source.addEncryptedRemote();
  const samples = [];
  await observed("budget-overflow", "upload", (onProgress, onSyncProgress) => source.pushInitialBranch({
    onSyncProgress,
    onProgress(event) {
      if (event.direction === "upload") samples.push({ ...event, atMs: performance.now() });
      onProgress(event);
    },
  }));
  assert.ok(samples.filter((event) => event.transferredBytes > 0).length >= 3);
  assert.ok(samples.every((event) => !event.totalIsFinal), "a partial inventory became a final budget");
  assert.ok(samples.some((event) => event.transferredBytes > 0 && event.transferredBytes < samples.at(-1).transferredBytes));
  const sent = JSON.parse(readFileSync(capture)).filter((request) => request.method === "PUT"
    && /\/raw-if-not-exists\/e2ee\/(objects|packs|indexes|files|commits|segments)\//.test(request.path));
  assert.ok(sent.length > 256, "the case did not exceed the retained payload inventory");
  assert.equal(sent.reduce((bytes, request) => bytes + request.body.length / 2, 0), samples.at(-1).transferredBytes,
    "fallback cumulative bytes differ from actual server payload bytes");
  if (process.env.GRAFT_PROGRESS_OVERFLOW_CAPTURE) {
    writeFileSync(process.env.GRAFT_PROGRESS_OVERFLOW_CAPTURE, JSON.stringify({ samples }, null, 2));
  }
}
