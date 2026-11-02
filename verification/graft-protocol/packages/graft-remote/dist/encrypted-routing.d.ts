import { GraftProtocolError } from "./protocol.js";
/** Public, unauthenticated routing data. Only clients can verify its MAC and pack. */
export interface EncryptedRoutingHint {
    key: string;
    pack: string;
    index: string;
    commits: {
        token: string;
        parents: string[];
    }[];
}
/** Disposable derived state. Opaque immutable hint objects remain authoritative. */
export declare class EncryptedRoutingIndex {
    #private;
    readonly hints: Map<string, EncryptedRoutingHint>;
    add(hint: EncryptedRoutingHint): void;
    /** Iterative DFS detects cycles; a missing node is never an empty history. */
    select(target: string, have: string | null): EncryptedRoutingHint[];
}
export declare function hintUnavailable(): GraftProtocolError;
//# sourceMappingURL=encrypted-routing.d.ts.map