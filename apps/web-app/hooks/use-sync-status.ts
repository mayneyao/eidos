"use desktop"

import { MsgType } from '@/lib/const'; // Assuming MsgType is exported from here
import { useCallback, useState } from 'react';
import { create } from 'zustand';
import type { GraftStatus } from '@/packages/sync/graft/helpers';
import { useCurrentSpaceId } from './use-current-space';
import { useSqlite } from './use-sqlite';

interface SyncStatusState {
    status: GraftStatus | null;
    lastUpdated: Date | null;
    setStatus: (status: GraftStatus | null) => void;
    setLastUpdated: (date: Date | null) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
    status: null,
    lastUpdated: null,
    setStatus: (status) => set({ status, lastUpdated: status ? new Date() : null }),
    setLastUpdated: (lastUpdated) => set({ lastUpdated }),
}));

export function useSpaceSyncStatus() {
    const spaceId = useCurrentSpaceId()
    const { status, lastUpdated, setStatus } = useSyncStatusStore();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const { sqlite } = useSqlite()

    const fetchStatus = useCallback(async () => {
        if (!spaceId || !sqlite) {
            console.log('useSpaceSyncStatus: No spaceId available, skipping fetch');
            return;
        }

        console.log('useSpaceSyncStatus: Fetching status for space:', spaceId);
        setIsLoading(true);
        setError(null);
        try {
            const result = await sqlite.status();
            console.log('useSpaceSyncStatus: Status fetched successfully:', result);
            setStatus(result);
        } catch (err) {
            console.error(`useSpaceSyncStatus: Error fetching status for space ${spaceId}:`, err);
            setError(err instanceof Error ? err : new Error('Failed to fetch status'));
            setStatus(null); // Optionally reset status on error
        } finally {
            setIsLoading(false);
            console.log('useSpaceSyncStatus: Fetch status operation completed');
        }
    }, [spaceId, setStatus]);

    return { status, lastUpdated, isLoading, error, fetchStatus };
}