"use desktop"

import { MsgType } from '@/lib/const'; // Assuming MsgType is exported from here
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useCurrentPathInfo } from './use-current-pathinfo';
import type { GraftStatus } from '@/packages/sync/graft/helpers';

const POLLING_INTERVAL = 10000; // Poll every 10 seconds


interface SyncStatusState {
    status: GraftStatus | null;
    setStatus: (status: GraftStatus | null) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
    status: null,
    setStatus: (status) => set({ status }),
}));

export function useSpaceSyncStatus() {
    const { space } = useCurrentPathInfo()
    const { status, setStatus } = useSyncStatusStore();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!space) {
            return
        }
        let intervalId: NodeJS.Timeout | null = null;

        const fetchStatus = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const result = await window.eidos.invoke(MsgType.Status, { spaceName: space });
                setStatus(result);
            } catch (err) {
                console.error(`Error fetching status for space ${space}:`, err);
                setError(err instanceof Error ? err : new Error('Failed to fetch status'));
                setStatus(null); // Optionally reset status on error
            } finally {
                setIsLoading(false);
            }
        };

        // Fetch immediately on mount/space change
        fetchStatus();

        // Set up polling
        intervalId = setInterval(fetchStatus, POLLING_INTERVAL);

        // Cleanup function
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [space, setStatus]); // Rerun effect if space changes

    return { status, isLoading, error };
}