
import { isInkServiceMode } from '@/lib/env';
import type { DataSpace } from '@eidos.space/core/data-space';
import { create } from 'zustand';
import { useSqlite } from './use-sqlite';

interface SqliteStore {
    readonlySqlite: DataSpace | undefined;
    setReadSqliteProxy: (proxy: DataSpace) => void;
}

export const useReadSqliteStore = create<SqliteStore>((set) => ({
    readonlySqlite: undefined,
    setReadSqliteProxy: (proxy) => set({ readonlySqlite: proxy }),
}));

export const useReadonlySqlite = () => {
    const { readonlySqlite } = useReadSqliteStore();
    const { sqlite } = useSqlite();
    // sqlite is the readonly sqlite in ink service mode
    if (isInkServiceMode) {
        return sqlite;
    }
    return readonlySqlite;
}