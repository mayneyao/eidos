import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface SpaceInfo {
    id: string;
    name: string;
    path: string;
}

export interface SpacesConfig {
    spaces: SpaceInfo[];
}

export interface GlobalConfig {
    lastOpenedSpace?: string;
}

export class SpaceRegistry {
    private static instance: SpaceRegistry;
    private eidosDir: string;
    private spacesConfigPath: string;
    private globalConfigPath: string;

    private constructor() {
        this.eidosDir = path.join(os.homedir(), '.eidos');
        this.spacesConfigPath = path.join(this.eidosDir, 'spaces.json');
        this.globalConfigPath = path.join(this.eidosDir, 'config.json');
    }

    public static getInstance(): SpaceRegistry {
        if (!SpaceRegistry.instance) {
            SpaceRegistry.instance = new SpaceRegistry();
        }
        return SpaceRegistry.instance;
    }

    /**
     * Ensure .eidos directory exists
     */
    private ensureEidosDir(): void {
        if (!fs.existsSync(this.eidosDir)) {
            fs.mkdirSync(this.eidosDir, { recursive: true });
        }
    }

    /**
     * Copy directory recursively
     */
    private copyDirectoryRecursive(src: string, dest: string): void {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                this.copyDirectoryRecursive(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }


    public async migrateFromLegacyConfig(): Promise<void> {
        // if new config exists, skip migration
        if (fs.existsSync(this.spacesConfigPath)) {
            return;
        }

        this.ensureEidosDir();

        // Read legacy config
        const legacyConfigPath = path.join(app.getPath('userData'), 'config.json');
        if (!fs.existsSync(legacyConfigPath)) {
            // Fresh installation, create default space
            await this.createDefaultSpace();
            return;
        }

        try {
            const legacyConfig = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf-8'));
            const dataFolder = legacyConfig.dataFolder;

            if (!dataFolder) {
                await this.createDefaultSpace();
                return;
            }

            // Scan spaces directory
            const spacesDir = path.join(dataFolder, 'spaces');
            if (!fs.existsSync(spacesDir)) {
                await this.createDefaultSpace();
                return;
            }

            const spaces: SpaceInfo[] = [];
            const folders = fs.readdirSync(spacesDir);

            for (const folder of folders) {
                const oldSpacePath = path.join(spacesDir, folder);
                const oldDbPath = path.join(oldSpacePath, 'db.sqlite3');
                const oldFilesPath = path.join(oldSpacePath, 'files');

                // Only migrate spaces that have database files
                if (fs.existsSync(oldDbPath)) {
                    // Keep the same space path (in-place migration)
                    const spacePath = oldSpacePath;
                    const eidosDir = path.join(spacePath, '.eidos');
                    const newDbPath = path.join(eidosDir, 'db.sqlite3');
                    const newFilesPath = path.join(eidosDir, 'files');

                    // Create new directory structure within the existing space
                    fs.mkdirSync(eidosDir, { recursive: true });
                    fs.mkdirSync(newFilesPath, { recursive: true });

                    // Migrate database file
                    if (fs.existsSync(oldDbPath)) {
                        fs.copyFileSync(oldDbPath, newDbPath);
                        console.log(`Migrated database: ${oldDbPath} -> ${newDbPath}`);
                    }

                    // Migrate files directory
                    if (fs.existsSync(oldFilesPath)) {
                        this.copyDirectoryRecursive(oldFilesPath, newFilesPath);
                        console.log(`Migrated files: ${oldFilesPath} -> ${newFilesPath}`);
                    }

                    spaces.push({
                        id: folder,
                        name: folder.charAt(0).toUpperCase() + folder.slice(1), // Capitalize first letter
                        path: spacePath
                    });
                }
            }

            if (spaces.length === 0) {
                await this.createDefaultSpace();
                return;
            }

            // Create new config
            this.saveSpacesConfig({ spaces });
            this.saveGlobalConfig({ lastOpenedSpace: spaces[0].id });

            console.log(`Migrated ${spaces.length} spaces from legacy config`);
        } catch (error) {
            console.error('Error migrating from legacy config:', error);
            await this.createDefaultSpace();
        }
    }


    private async createDefaultSpace(): Promise<void> {
        const defaultSpacePath = path.join(app.getPath('userData'), 'eidos-data', 'spaces', 'default');
        const defaultSpace: SpaceInfo = {
            id: 'default',
            name: 'Default',
            path: defaultSpacePath
        };

        // 确保目录存在
        fs.mkdirSync(defaultSpacePath, { recursive: true });

        this.saveSpacesConfig({ spaces: [defaultSpace] });
        this.saveGlobalConfig({ lastOpenedSpace: 'default' });

        console.log('Created default space');
    }


    private saveSpacesConfig(config: SpacesConfig): void {
        fs.writeFileSync(this.spacesConfigPath, JSON.stringify(config, null, 2));
    }

    /**
     * Save global configuration
     */
    private saveGlobalConfig(config: GlobalConfig): void {
        fs.writeFileSync(this.globalConfigPath, JSON.stringify(config, null, 2));
    }


    private loadSpacesConfig(): SpacesConfig {
        if (!fs.existsSync(this.spacesConfigPath)) {
            return { spaces: [] };
        }

        try {
            const data = fs.readFileSync(this.spacesConfigPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading spaces config:', error);
            return { spaces: [] };
        }
    }


    private loadGlobalConfig(): GlobalConfig {
        if (!fs.existsSync(this.globalConfigPath)) {
            return {};
        }

        try {
            const data = fs.readFileSync(this.globalConfigPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading global config:', error);
            return {};
        }
    }


    public getAllSpaces(): SpaceInfo[] {
        const config = this.loadSpacesConfig();
        return config.spaces;
    }


    public getSpace(id: string): SpaceInfo | null {
        const spaces = this.getAllSpaces();
        return spaces.find(space => space.id === id) || null;
    }


    public getFirstSpace(): SpaceInfo | null {
        const spaces = this.getAllSpaces();
        return spaces.length > 0 ? spaces[0] : null;
    }

    /**
     * Get the last opened workspace
     */
    public getLastOpenedSpace(): SpaceInfo | null {
        const globalConfig = this.loadGlobalConfig();
        if (!globalConfig.lastOpenedSpace) {
            return this.getFirstSpace();
        }
        return this.getSpace(globalConfig.lastOpenedSpace);
    }


    public setLastOpenedSpace(spaceId: string): void {
        const space = this.getSpace(spaceId);
        if (!space) {
            throw new Error(`Space not found: ${spaceId}`);
        }

        const globalConfig = this.loadGlobalConfig();
        globalConfig.lastOpenedSpace = spaceId;
        this.saveGlobalConfig(globalConfig);
    }


    public registerSpace(spacePath: string, customName?: string): SpaceInfo {
        if (!fs.existsSync(spacePath)) {
            throw new Error(`Path does not exist: ${spacePath}`);
        }

        // generate space id based on folder name
        const folderName = path.basename(spacePath);
        let spaceId = this.sanitizeId(folderName);

        // handle id conflict
        let counter = 1;
        const originalId = spaceId;
        while (this.getSpace(spaceId)) {
            spaceId = `${originalId}-${counter}`;
            counter++;
        }

        const space: SpaceInfo = {
            id: spaceId,
            name: customName || folderName.charAt(0).toUpperCase() + folderName.slice(1),
            path: spacePath
        };

        const config = this.loadSpacesConfig();
        config.spaces.push(space);
        this.saveSpacesConfig(config);

        return space;
    }


    public removeSpace(spaceId: string): boolean {
        const config = this.loadSpacesConfig();
        const index = config.spaces.findIndex(space => space.id === spaceId);

        if (index === -1) {
            return false;
        }

        config.spaces.splice(index, 1);
        this.saveSpacesConfig(config);

        const globalConfig = this.loadGlobalConfig();
        if (globalConfig.lastOpenedSpace === spaceId) {
            globalConfig.lastOpenedSpace = config.spaces.length > 0 ? config.spaces[0].id : undefined;
            this.saveGlobalConfig(globalConfig);
        }

        return true;
    }


    public updateSpace(spaceId: string, updates: Partial<Omit<SpaceInfo, 'id'>>): boolean {
        const config = this.loadSpacesConfig();
        const space = config.spaces.find(s => s.id === spaceId);

        if (!space) {
            return false;
        }

        Object.assign(space, updates);
        this.saveSpacesConfig(config);
        return true;
    }


    private sanitizeId(id: string): string {
        return id
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }


    public validateSpace(spaceId: string): boolean {
        const space = this.getSpace(spaceId);
        if (!space) {
            return false;
        }

        if (!fs.existsSync(space.path)) {
            return false;
        }

        // Check for database in the new .eidos subdirectory structure
        const dbPath = path.join(space.path, '.eidos', 'db.sqlite3');
        return fs.existsSync(dbPath);
    }
}

export function getSpaceRegistry(): SpaceRegistry {
    return SpaceRegistry.getInstance();
}

export async function migrateFromLegacyConfig(): Promise<void> {
    const registry = getSpaceRegistry();
    await registry.migrateFromLegacyConfig();
}
