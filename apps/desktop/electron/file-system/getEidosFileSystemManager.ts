import { EidosFileSystemManager } from '@/lib/storage/eidos-file-system';
import { getOriginPrivateDirectory } from 'native-file-system-adapter';
// @ts-ignore
import nodeAdapter from 'native-file-system-adapter/src/adapters/node';
import { getConfigManager } from '../config';


export async function getEidosFileSystemManager() {
    const userDataPath = getConfigManager().get('dataFolder');
    const dirHandle = await getOriginPrivateDirectory(nodeAdapter, userDataPath);
    return new EidosFileSystemManager(dirHandle as any);
}
