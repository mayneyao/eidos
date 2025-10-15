import { EidosFileSystemManager } from '@/lib/storage/eidos-file-system';
import { getOriginPrivateDirectory } from 'native-file-system-adapter';
// @ts-ignore
import nodeAdapter from 'native-file-system-adapter/src/adapters/node';
import { getConfigManager } from '../config';
import { getSpaceRegistry } from '../space-registry';
import path from 'path';
import fs from 'fs';


export async function getEidosFileSystemManager(spaceId?: string) {
    if (spaceId) {
        // New structure: {userDir}/.eidos (EFS root)
        const spaceInfo = getSpaceRegistry().getSpace(spaceId);
        if (spaceInfo) {
            const eidosDir = path.join(spaceInfo.path, '.eidos');

            if (!fs.existsSync(eidosDir)) {
                fs.mkdirSync(eidosDir, { recursive: true });
            }

            const dirHandle = await getOriginPrivateDirectory(nodeAdapter, eidosDir);
            return new EidosFileSystemManager(dirHandle as any);
        }
    }

    // Fallback to old structure for backward compatibility
    const userDataPath = getConfigManager().get('dataFolder');
    if (userDataPath) {
        const dirHandle = await getOriginPrivateDirectory(nodeAdapter, userDataPath);
        return new EidosFileSystemManager(dirHandle as any);
    }

    throw new Error('No data folder configured and no space ID provided');
}
