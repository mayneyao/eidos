import Database from "@eidos.space/better-sqlite3";
import { getDataSpace } from "../data-space";
import { getResourcePath } from "../helper";
import { applyGraftConfigToEnv } from "./helper";
import { getSpaceRegistry } from "../space-registry";
import path from "path";
import { CredentialsManager } from "../credentials";
import { parseGraftNew } from "@/packages/sync/graft/helpers";

export const initGraftDatabase = async (spaceId: string) => {
    const dataSpace = getDataSpace();
    if (!dataSpace) {
        throw new Error('No active data space');
    }
    await dataSpace.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const space = getSpaceRegistry().getSpace(spaceId);
    if (!space) {
        throw new Error('Space not found');
    }
    const graftLibPath = getResourcePath('dist-sqlite-ext/libgraft');

    const credentials = await CredentialsManager.getSyncCredentials('eidos.space');
    if (!credentials) {
        throw new Error('Credentials not found');
    }
    applyGraftConfigToEnv(spaceId, credentials);

    const vfsRegistrationDb = new Database(':memory:');
    try {
        vfsRegistrationDb.loadExtension(graftLibPath);
    } catch (err: any) {
        // This is likely a fatal error for sync functionality
        throw new Error(`Failed to load graft VFS extension from ${graftLibPath}: ${err.message}`);
    } finally {
        vfsRegistrationDb.close();
    }
    const db = new Database("file:main?vfs=graft");
    const parsedRes = await db.pragma('graft_new');

    const graftInfo = parseGraftNew(parsedRes);
    console.log('Parsed graft info:', graftInfo);

    const dbPath = path.join(space.path, '.eidos', 'db.sqlite3');
    const re2 = await db.pragma('graft_status');
    console.log('Graft status:', re2);

    // import db to new db
    db.pragma(`graft_import = "${dbPath}";`);
    const re3 = await db.pragma('graft_status');
    console.log('Graft status:', re3);

    // push db to remote
    const result = await db.pragma(`graft_push`);
    console.log('Graft push result:', result);
    const re4 = await db.pragma('graft_status');
    console.log('Graft status:', re4);

    getSpaceRegistry().setSpaceSync(spaceId, {
        enabled: true,
        remote: `https://eidos.space/${credentials.bucketName}/${graftInfo?.volumeId ?? ''}.graft`,
    });
}