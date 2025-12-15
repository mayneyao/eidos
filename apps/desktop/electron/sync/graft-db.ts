import type { DataSpace } from "@/packages/core/data-space";
import Database from "@eidos.space/better-sqlite3";
import path from "path";
import { getResourcePath } from "../helper";
import { applyGraftConfigToEnv } from "./helper";
import { parseGraftNew } from "@/packages/sync/graft/helpers";
import type { SpaceInfo } from "../space-registry";
import { CredentialsManager } from "../credentials";
import { isVFSInitialized } from "../sqlite-server";
import fs from "node:fs";
import { getSpaceRegistry } from "@/packages/space-manager/src/space-registry";

export class GraftDb {
    private dataSpace: DataSpace;

    constructor(dataSpace: DataSpace) {
        this.dataSpace = dataSpace;
    }


    private async registerGraftVFS(graftLibPath: string): Promise<void> {
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

    /**
     * 把 db.sqlite3 转为 graft 的存储
     */
    public async convertToGraft(spaceInfo: SpaceInfo): Promise<void> {
        // 确保数据库在 WAL 模式下进行检查点
        await this.dataSpace.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

        // 获取同步凭据
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

        // 应用 graft 配置到环境变量
        applyGraftConfigToEnv(spaceInfo, credentials);

        const registry = getSpaceRegistry();
        registry.setSpaceSync(spaceInfo.id, {
            enabled: true,
            remote: spaceInfo.sync?.remote || '',
        });
    }

    /**
     * 从 graft 检出 db.sqlite3
     */
    public async checkoutFromGraft(spaceInfo: SpaceInfo): Promise<void> {
        const graftLibPath = getResourcePath('dist-sqlite-ext/libgraft');

        // 获取同步凭据
        const credentials = await CredentialsManager.getSyncCredentials('eidos.space');
        if (!credentials) {
            throw new Error('Credentials not found');
        }

        // // 应用 graft 配置到环境变量
        applyGraftConfigToEnv(spaceInfo, credentials);

        await this.registerGraftVFS(graftLibPath);
        // 连接到 graft 数据库
        const db = new Database("file:main?vfs=graft");

        try {
            // 从远程拉取最新的数据
            const fetchResult = await db.pragma('graft_fetch');
            console.log('Graft fetch result:', fetchResult);

            // 合并远程数据
            const pullResult = await db.pragma('graft_pull');
            console.log('Graft pull result:', pullResult);

            // 从 graft 导出到本地 SQLite 文件
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
            // 关闭数据库连接
            db.close();
        }
    }
}