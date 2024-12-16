import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';



export interface AppConfig {
    // the folder where the data is stored
    dataFolder: string;
    // the api agent config
    apiAgentConfig: {
        url: string;
        enabled: boolean;
    };
}


const emptyConfig: AppConfig = {
    dataFolder: '',
    apiAgentConfig: {
        url: '',
        enabled: false,
    },
};

export class ConfigManager extends EventEmitter {
    private configPath: string;
    private config: AppConfig;

    constructor(configPath: string) {
        super();
        this.configPath = configPath;
        this.config = this.loadConfig();
    }

    private loadConfig(): AppConfig {
        if (fs.existsSync(this.configPath)) {
            const rawData = fs.readFileSync(this.configPath, 'utf-8');
            return JSON.parse(rawData);
        }
        return emptyConfig;
    }

    private saveConfig(): void {
        const rawData = JSON.stringify(this.config, null, 2);
        fs.writeFileSync(this.configPath, rawData, 'utf-8');
    }

    public get(key: keyof AppConfig): any {
        return this.config[key];
    }

    public set(key: keyof AppConfig, value: any): void {
        const oldValue = this.config[key];
        this.config[key] = value;
        this.saveConfig();
        console.log('configChanged', { key, oldValue, newValue: value });
        this.emit('configChanged', { key, oldValue, newValue: value });
    }

}

let configManagerInstance: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
    if (!configManagerInstance) {
        const userDataPath = app.getPath('userData');
        const configFilePath = path.join(userDataPath, 'config.json');
        configManagerInstance = new ConfigManager(configFilePath);
    }
    return configManagerInstance;
}
