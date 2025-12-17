import type { DataSpace } from "@/packages/core/data-space";
import { getSpaceRegistry } from "@/packages/space-manager/src/space-registry";
import Database from "@eidos.space/better-sqlite3";
import fs from "node:fs";
import path from "path";
import { CredentialsManager } from "../credentials";
import { getResourcePath } from "../helper";
import type { SpaceInfo } from "../space-registry";
import { isVFSInitialized } from "../sqlite-server/initializer";
import { applyGraftConfigToEnv } from "./helper";


function registerGraftVFS(graftLibPath: string): void {
    if (isVFSInitialized) {
        console.warn('====== VFS is already initialized ======')
        return;
    }
    const vfsRegistrationDb = new Database(':memory:');
    try {
        vfsRegistrationDb.loadExtension(graftLibPath);
    } catch (err: any) {
        throw new Error(`Failed to load graft VFS extension from ${graftLibPath}: ${err.message}`);
    } finally {
        vfsRegistrationDb.close();
    }
}


export class GraftDb {
    private dataSpace: DataSpace;

    constructor(dataSpace: DataSpace) {
        this.dataSpace = dataSpace;
    }

    public async convertToGraft(spaceInfo: SpaceInfo): Promise<void> {
        await this.dataSpace.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

        // 
        const credentials = await CredentialsManager.getSyncCredentials('eidos.space');
        if (!credentials) {
            throw new Error('Credentials not found');
        }

        // remove the graft config file and directory
        const graftConfigPath = path.join(spaceInfo.path, '.eidos', 'graft.toml');
        if (fs.existsSync(graftConfigPath)) {
            fs.unlinkSync(graftConfigPath);
            console.log('Removed graft config file:', graftConfigPath);
        }
        const graftDirPath = path.join(spaceInfo.path, '.eidos', '.graft');
        if (fs.existsSync(graftDirPath)) {
            fs.rmdirSync(graftDirPath, { recursive: true });
            console.log('Removed graft directory:', graftDirPath);
        }

        applyGraftConfigToEnv(spaceInfo, credentials);

        const registry = getSpaceRegistry();
        registry.setSpaceSync(spaceInfo.id, {
            enabled: true,
            remote: spaceInfo.sync?.remote || '',
        });
    }


    public async checkoutFromGraft(spaceInfo: SpaceInfo): Promise<void> {
        const graftLibPath = getResourcePath('dist-sqlite-ext/libgraft');

        const credentials = await CredentialsManager.getSyncCredentials('eidos.space');
        if (!credentials) {
            throw new Error('Credentials not found');
        }

        applyGraftConfigToEnv(spaceInfo, credentials);
        registerGraftVFS(graftLibPath);

        const db = new Database("file:main?vfs=graft");

        try {
            const fetchResult = await db.pragma('graft_fetch');
            console.log('Graft fetch result:', fetchResult);

            const pullResult = await db.pragma('graft_pull');
            console.log('Graft pull result:', pullResult);

            const dbPath = path.join(spaceInfo.path, '.eidos', 'db.sqlite3');
            db.pragma(`graft_export = "${dbPath}";`);
            console.log('Graft export completed to:', dbPath);


            // check if the db.sqlite3 file is exists
            if (fs.existsSync(dbPath)) {
                console.log('db.sqlite3 file exists:', dbPath);
                db.close();
            }

            // remove the graft config file
            const graftConfigPath = path.join(spaceInfo.path, '.eidos', 'graft.toml');
            if (fs.existsSync(graftConfigPath)) {
                fs.unlinkSync(graftConfigPath);
                console.log('Removed graft config file:', graftConfigPath);
            }
            // remove the graft directory
            const graftDirPath = path.join(spaceInfo.path, '.eidos', '.graft');
            if (fs.existsSync(graftDirPath)) {
                fs.rmdirSync(graftDirPath, { recursive: true });
                console.log('Removed graft directory:', graftDirPath);
            }
            console.log('Removed graft config file:', path.join(spaceInfo.path, '.eidos', 'graft.toml'));
            console.log('Removed graft directory:', path.join(spaceInfo.path, '.eidos', '.graft'));

            // Update space registry to mark sync as disabled
            const registry = getSpaceRegistry();
            registry.setSpaceSync(spaceInfo.id, {
                ...spaceInfo.sync??{},
                enabled: false,
                remote: spaceInfo.sync?.remote || '',
            });
        } finally {
            db.close();
        }
    }
}