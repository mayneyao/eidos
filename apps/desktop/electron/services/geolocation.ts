import { URLS } from "@/lib/const";
import type { BrowserWindow } from "electron";

/**
 * Sets up geolocation permission handling for a browser window
 * Fetches location from API and applies it using debugger
 */
export function setupGeolocationHandler(win: BrowserWindow) {
    win.webContents.session.setPermissionRequestHandler(async (webContents, permission, callback) => {
        if (permission === 'geolocation') {
            // Allow geolocation requests
            callback(true);

            try {
                // Get location from custom API
                const response = await fetch(URLS.GEOLOCATION_API);
                const locationData = await response.json();

                // Use debugger API to set location
                if (!webContents.debugger.isAttached()) {
                    webContents.debugger.attach('1.3');
                }

                // Set location from API
                webContents.debugger.sendCommand('Emulation.setGeolocationOverride', {
                    latitude: parseFloat(locationData.latitude),
                    longitude: parseFloat(locationData.longitude),
                    accuracy: 100
                });

                console.log('Location set:', locationData.city, locationData.latitude, locationData.longitude);
            } catch (err) {
                console.error('Failed to get or set location:', err);

                // Use default location if API call fails
                try {
                    if (webContents.debugger.isAttached()) {
                        webContents.debugger.sendCommand('Emulation.setGeolocationOverride', {
                            latitude: 39.9042,
                            longitude: 116.4074,
                            accuracy: 100
                        });
                    }
                } catch (debugErr) {
                    console.error('Failed to set default location:', debugErr);
                }
            }
        } else {
            callback(true);
        }
    });
}
