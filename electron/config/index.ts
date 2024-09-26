import { app } from 'electron';
import fs from 'fs';
import path from 'path';


export class ConfigManager {
    private configPath: string;
    private config: { [key: string]: any };

    constructor(configPath: string) {
        this.configPath = configPath;
        this.config = this.loadConfig();
    }

    private loadConfig(): { [key: string]: any } {
        if (fs.existsSync(this.configPath)) {
            const rawData = fs.readFileSync(this.configPath, 'utf-8');
            return JSON.parse(rawData);
        }
        return {};
    }

    private saveConfig(): void {
        const rawData = JSON.stringify(this.config, null, 2);
        fs.writeFileSync(this.configPath, rawData, 'utf-8');
    }

    public get(key: string): any {
        return this.config[key];
    }

    public set(key: string, value: any): void {
        this.config[key] = value;
        this.saveConfig();
    }

}


export function getAppConfig(): {
    dataFolder: string;
} {
    const userDataPath = app.getPath('userData');
    const configFilePath = path.join(userDataPath, 'config.json');

    if (fs.existsSync(configFilePath)) {
        return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
    } else {
        // Handle the case where the config file does not exist
        return { dataFolder: '' }; // Return a default configuration or handle as needed
    }
}
