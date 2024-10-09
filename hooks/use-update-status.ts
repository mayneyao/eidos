import { isDesktopMode } from "@/lib/env";
import { useEffect, useState } from "react"


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

export const useUpdateStatus = () => {
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
    const [updateError, setUpdateError] = useState<string | null>(null);

    useEffect(() => {
        if (!isDesktopMode) {
            return
        }
        const handleUpdateStatus = (status: UpdateStatus, data?: any) => {
            setUpdateStatus(status);
            switch (status) {
                case 'available':
                case 'downloaded':
                    setUpdateInfo(data);
                    break;
                case 'progress':
                    setUpdateProgress(data);
                    break;
                case 'error':
                    setUpdateError(data.message || 'Unknown error');
                    break;
                default:
                    break;
            }
        };

        window.eidos.on('update-status', (event, status: UpdateStatus, data?: any) => {
            handleUpdateStatus(status, data);
        });

        return () => {
            window.eidos.off('update-status', (event, status: UpdateStatus, data?: any) => {
                handleUpdateStatus(status, data);
            });
        };
    }, []);

    const checkForUpdates = () => {
        window.eidos.invoke('check-for-updates');
    };

    const quitAndInstall = () => {
        window.eidos.invoke('quit-and-install');
    };

    return {
        updateStatus,
        updateInfo,
        updateProgress,
        updateError,
        checkForUpdates,
        quitAndInstall
    };
};

