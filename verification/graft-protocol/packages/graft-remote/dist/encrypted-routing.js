import { GraftProtocolError, bytewiseCompare } from "./protocol.js";
const MAX_COMMITS = 100_000;
const MAX_HINTS = 100_000;
const MAX_PARENTS = 1_000_000;
const MAX_PLACEMENTS = 32_768;
// A handler retains at most four repositories. Keep the disposable indexes
// within 32 MiB of accounted storage across those repositories.
const MAX_RETAINED_BYTES = 8 * 1024 * 1024;
const MAX_PENDING = 32_768;
/** Disposable derived state. Opaque immutable hint objects remain authoritative. */
export class EncryptedRoutingIndex {
    hints = new Map();
    #commits = new Map();
    #conflicts = new Set();
    #parents = 0;
    #placements = 0;
    #retainedBytes = 0;
    add(hint) {
        const existing = this.hints.get(hint.key);
        if (existing !== undefined) {
            if (JSON.stringify(existing) !== JSON.stringify(hint))
                throw hintUnavailable();
            return;
        }
        const added = hint.commits.filter(({ token }) => !this.#commits.has(token));
        // Repacking a commit adds another retained row and parent array even when
        // its topology is already indexed. Count those placements independently.
        const parents = hint.commits.reduce((sum, commit) => sum + commit.parents.length, 0);
        // Account UTF-16 strings and explicit per-record/array-slot allowances.
        // Count repeated strings independently; this must not depend on interning.
        const retainedBytes = 128 + 2 * (hint.key.length + hint.pack.length + hint.index.length) +
            hint.commits.reduce((sum, commit) => sum + 64 + 2 * commit.token.length +
                commit.parents.reduce((bytes, parent) => bytes + 8 + 2 * parent.length, 0), 0);
        if (this.hints.size >= MAX_HINTS || this.#commits.size + added.length > MAX_COMMITS ||
            this.#parents + parents > MAX_PARENTS ||
            this.#placements + hint.commits.length > MAX_PLACEMENTS ||
            this.#retainedBytes + retainedBytes > MAX_RETAINED_BYTES)
            throw hintUnavailable();
        this.hints.set(hint.key, hint);
        this.#parents += parents;
        this.#placements += hint.commits.length;
        this.#retainedBytes += retainedBytes;
        for (const commit of hint.commits) {
            const previous = this.#commits.get(commit.token);
            if (previous === undefined) {
                this.#commits.set(commit.token, { parents: commit.parents, hints: new Set([hint.key]) });
            }
            else {
                if (previous.parents.length !== commit.parents.length ||
                    previous.parents.some((parent, index) => parent !== commit.parents[index])) {
                    this.#conflicts.add(commit.token);
                }
                previous.hints.add(hint.key);
            }
        }
    }
    /** Iterative DFS detects cycles; a missing node is never an empty history. */
    select(target, have) {
        const states = new Map();
        const selected = new Set();
        const stack = [{ token: target, exit: false }];
        while (stack.length !== 0) {
            const { token, exit } = stack.pop();
            if (token === have)
                continue;
            if (exit) {
                states.set(token, 2);
                continue;
            }
            const state = states.get(token);
            if (state === 2)
                continue;
            if (state === 1 || this.#conflicts.has(token))
                throw hintUnavailable();
            const commit = this.#commits.get(token);
            if (commit === undefined || states.size >= MAX_COMMITS)
                throw hintUnavailable();
            states.set(token, 1);
            // Repacked identical commits can occur in multiple hints. Selection is stable.
            selected.add([...commit.hints].sort(bytewiseCompare)[0]);
            if (selected.size > 128)
                throw hintUnavailable();
            if (stack.length + 1 + commit.parents.length > MAX_PENDING)
                throw hintUnavailable();
            stack.push({ token, exit: true });
            for (let index = commit.parents.length - 1; index >= 0; index -= 1) {
                stack.push({ token: commit.parents[index], exit: false });
            }
        }
        return [...selected].sort(bytewiseCompare).map((key) => this.hints.get(key));
    }
}
export function hintUnavailable() {
    return new GraftProtocolError(422, "encrypted_hint_unavailable", "Encrypted graph planning is unavailable");
}
//# sourceMappingURL=encrypted-routing.js.map