import { isDesktopMode } from "@/lib/env";
import { create } from 'zustand';

type UpdateStatus = 'checking' | 'available' | 'not-available' | 'error' | 'progress' | 'downloaded' | 'idle';

interface UpdateInfo {
    version: string;
    releaseDate: string;
    releaseNotes: string;
}

interface UpdateProgress {
    bytesPerSecond: number;
    percent: number;
    transferred: number;
    total: number;
}

interface UpdateStore {
    updateStatus: UpdateStatus;
    updateInfo: UpdateInfo | null;
    updateProgress: UpdateProgress | null;
    updateError: string | null;
    checkForUpdates: () => void;
    quitAndInstall: () => void;
}

// 创建 Zustand store
const useUpdateStore = create<UpdateStore>((set) => ({
    updateStatus: 'idle',
    updateInfo: null,
    updateProgress: null,
    updateError: null,

    checkForUpdates: () => {
        if (isDesktopMode) {
            window.eidos.invoke('check-for-updates');
        }
    },

    quitAndInstall: () => {
        if (isDesktopMode) {
            window.eidos.invoke('quit-and-install');
        }
    }
}));

// 初始化 store 和事件监听
if (typeof window !== 'undefined' && isDesktopMode && !(window as any).__updateStoreInitialized) {
    (window as any).__updateStoreInitialized = true;

    const handleUpdateStatus = (status: UpdateStatus, data?: any) => {
        switch (status) {
            case 'available':
            case 'downloaded':
                useUpdateStore.setState({ updateStatus: status, updateInfo: data });
                break;
            case 'progress':
                useUpdateStore.setState({ updateStatus: status, updateProgress: data });
                break;
            case 'error':
                useUpdateStore.setState({
                    updateStatus: status,
                    updateError: data.message || 'Unknown error'
                });
                break;
            default:
                useUpdateStore.setState({ updateStatus: status });
                break;
        }
    };

    window.eidos?.on('update-status', (event: any, status: UpdateStatus, data?: any) => {
        handleUpdateStatus(status, data);
    });
}

// 导出 hook
export const useUpdateStatus = () => useUpdateStore();

