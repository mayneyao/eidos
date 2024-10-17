import { useState, useEffect } from 'react';

type OS = 'macOS' | 'Windows' | 'iOS' | 'Android' | 'Linux' | 'Unknown';

export const useOSDetection = () => {
    const [os, setOS] = useState<OS>('Unknown');

    useEffect(() => {
        const detectOS = () => {
            const userAgent = window.navigator.userAgent.toLowerCase();
            const platform = window.navigator.platform.toLowerCase();

            if (userAgent.indexOf('win') > -1) return 'Windows';
            if (userAgent.indexOf('mac') > -1) return 'macOS';
            if (userAgent.indexOf('iphone') > -1 || userAgent.indexOf('ipad') > -1) return 'iOS';
            if (userAgent.indexOf('android') > -1) return 'Android';
            if (userAgent.indexOf('linux') > -1) return 'Linux';

            return 'Unknown';
        };

        setOS(detectOS());
    }, []);

    return os;
};