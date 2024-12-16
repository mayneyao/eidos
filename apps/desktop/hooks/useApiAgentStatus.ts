import { useEffect, useState } from 'react';

export type ApiAgentStatus = {
    connected: boolean;
    enabled: boolean;
    url: string | null;
    lastError?: string;
    reconnectAttempts: number;
};

export function useApiAgentStatus() {
    const [status, setStatus] = useState<ApiAgentStatus>({
        connected: false,
        enabled: false,
        url: null,
        reconnectAttempts: 0
    });

    useEffect(() => {
        window.eidos.getApiAgentStatus().then(setStatus);

        const unsubscribe = window.eidos.onApiAgentStatusChanged((newStatus: ApiAgentStatus) => {
            setStatus(newStatus);
        });
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, []);

    return status;
} 