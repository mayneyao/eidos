import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import type { AIFormValues } from '@/packages/ai/config';
import type { CustomTheme } from '@/apps/web-app/store/theme-store';
import { getSpaceRegistry } from '../space-registry';


export interface AppConfig {
    // the folder where the data is stored (deprecated, use space registry instead)
    dataFolder?: string;
    // the api agent config
    apiAgentConfig: {
        url: string;
        enabled: boolean;
    };
    ai: AIFormValues;
    // Security configuration
    security: {
        webSecurity: boolean;
        crossOriginDomains: string[];
    };
    // Sync configuration
    sync: {
        enabled: boolean;
        // Future sync-related settings can go here
    };
    // Auto-update configuration
    autoUpdate: {
        enabled: boolean;
    };
    theme: {
        currentThemeName: string;
        customThemes: CustomTheme[];
    };
    // Last opened workspace ID
    lastOpenedSpace?: string;
    // User info
    user?: any;
    // Persisted window state for desktop shell
    windowState?: {
        width: number;
        height: number;
        x?: number;
        y?: number;
        isMaximized?: boolean;
    };
}

const emptyConfig: AppConfig = {
    dataFolder: undefined, // Deprecated, use space registry instead
    apiAgentConfig: {
        url: '',
        enabled: false,
    },
    ai: {
        localModels: [],
        llmProviders: [],
        autoLoadEmbeddingModel: false,
        embeddingModel: '',
        translationModel: '',
        codingModel: '',
        version: 0,
    },
    security: {
        webSecurity: true,
        crossOriginDomains: [],
    },
    sync: {
        enabled: false,
    },
    autoUpdate: {
        enabled: true,
    },
    theme: {
        currentThemeName: 'Default',
        customThemes: [],
    },
    lastOpenedSpace: undefined,
    user: undefined,
    windowState: undefined,
};

export class ConfigManager extends EventEmitter {
    private configPath: string;
    private config: AppConfig;
    private isGlobalConfig: boolean;

    constructor(configPath: string, isGlobalConfig: boolean = false) {
        super();
        this.configPath = configPath;
        this.isGlobalConfig = isGlobalConfig;
        this.config = this.loadConfig();
        // Ensure AI config has version field for synchronization
        this.ensureDefaultAIConfig();
    }

    private loadConfig(): AppConfig {
        let loadedConfig = JSON.parse(JSON.stringify(emptyConfig)); // Deep clone defaults
        if (fs.existsSync(this.configPath)) {
            try {
                const rawData = fs.readFileSync(this.configPath, 'utf-8');
                const parsedData = JSON.parse(rawData);

                // Deep merge ensuring 'sync' exists
                loadedConfig = {
                    ...loadedConfig, // Start with defaults
                    ...parsedData,   // Overlay saved config
                    sync: {          // Merge the sync object explicitly
                        ...(loadedConfig.sync || {}), // Start with default sync object structure
                        ...(parsedData.sync || {}),   // Overlay saved sync settings
                    },
                };
            } catch (error) {
                console.error("Error loading or parsing config file:", this.configPath, error);
                // Fallback to deep clone of default config if loading/parsing fails
                loadedConfig = JSON.parse(JSON.stringify(emptyConfig));
            }
        }
        return loadedConfig;
    }

    // Ensure that the loaded AI config has version field for synchronization
    private ensureDefaultAIConfig(): void {
        let needsSave = false;
        // Ensure ai object exists
        if (typeof this.config.ai !== 'object' || this.config.ai === null) {
            console.warn("AI config section missing, initializing with defaults.");
            this.config.ai = JSON.parse(JSON.stringify(emptyConfig.ai)); // Deep clone default AI
            needsSave = true;
        } else {
            // Ensure version field exists
            if (typeof this.config.ai.version !== 'number') {
                console.warn("AI config version missing or invalid, applying default.");
                this.config.ai.version = emptyConfig.ai.version;
                needsSave = true;
            }
        }
        if (needsSave) {
            this.saveConfig();
        }
    }

    private saveConfig(): void {
        try {
            const rawData = JSON.stringify(this.config, null, 2);
            // Ensure directory exists before writing
            fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
            fs.writeFileSync(this.configPath, rawData, 'utf-8');
        } catch (error) {
            console.error("Error saving config file:", this.configPath, error);
        }
    }

    // Type-safe getter for top-level keys
    public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        return this.config[key];
    }

    // Type-safe setter for top-level keys
    public set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
        const oldValue = this.config[key];
        if (JSON.stringify(oldValue) !== JSON.stringify(value)) { // Avoid saving if no change
            this.config[key] = value;
            this.saveConfig();
            console.log('Config changed:', { key, oldValue, newValue: value });
            this.emit('configChanged', { key, oldValue, newValue: value });
        }
    }


    // Getter for sync enabled status
    public isSyncEnabled(): boolean {
        // Ensure sync exists before accessing, falling back to default if necessary
        return this.config.sync?.enabled ?? emptyConfig.sync.enabled;
    }

    // Setter for sync enabled status
    public setSyncEnabled(enabled: boolean): void {
        // Ensure sync object exists
        if (!this.config.sync) {
            this.config.sync = JSON.parse(JSON.stringify(emptyConfig.sync));
        }
        const oldValue = this.config.sync.enabled;
        if (oldValue !== enabled) {
            this.config.sync.enabled = enabled;
            this.saveConfig();
            console.log('Sync enabled status changed:', { oldValue, newValue: enabled });
            this.emit('configChanged', { key: 'sync.enabled', oldValue, newValue: enabled });
        }
    }

    // Getter for auto-update enabled status
    public isAutoUpdateEnabled(): boolean {
        return this.config.autoUpdate?.enabled ?? emptyConfig.autoUpdate.enabled;
    }

    // Setter for auto-update enabled status
    public setAutoUpdateEnabled(enabled: boolean): void {
        const oldValue = this.config.autoUpdate.enabled;
        if (oldValue !== enabled) {
            this.config.autoUpdate.enabled = enabled;
            this.saveConfig();
            console.log('Auto-update enabled status changed:', { oldValue, newValue: enabled });
            this.emit('configChanged', { key: 'autoUpdate.enabled', oldValue, newValue: enabled });
        }
    }

    // Getter for last opened space
    public getLastOpenedSpace(): string | undefined {
        return this.config.lastOpenedSpace;
    }

    // Setter for last opened space
    public setLastOpenedSpace(spaceId: string | undefined): void {
        const oldValue = this.config.lastOpenedSpace;
        if (oldValue !== spaceId) {
            this.config.lastOpenedSpace = spaceId;
            this.saveConfig();
            console.log('Last opened space changed:', { oldValue, newValue: spaceId });
            this.emit('configChanged', { key: 'lastOpenedSpace', oldValue, newValue: spaceId });
        }
    }

    // Getter for user
    public getUser(): any {
        return this.config.user;
    }

    // Setter for user
    public setUser(user: any): void {
        const oldValue = this.config.user;
        if (JSON.stringify(oldValue) !== JSON.stringify(user)) {
            this.config.user = user;
            this.saveConfig();
            console.log('User changed:', { oldValue, newValue: user });
            this.emit('configChanged', { key: 'user', oldValue, newValue: user });
        }
    }
}

let configManagerInstance: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
    if (!configManagerInstance) {
        const globalConfigPath = path.join(os.homedir(), '.eidos', 'config.json');
        if (fs.existsSync(globalConfigPath)) {
            configManagerInstance = new ConfigManager(globalConfigPath, true);
        } else {
            const userDataPath = app.getPath('userData');
            const configFilePath = path.join(userDataPath, 'config.json');
            configManagerInstance = new ConfigManager(configFilePath, false);
        }
    }
    return configManagerInstance;
}
