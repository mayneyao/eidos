import { EidosFileSystemManager } from '@/lib/storage/eidos-file-system'
import { getOriginPrivateDirectory } from 'native-file-system-adapter'
import nodeAdapter from 'native-file-system-adapter/src/adapters/node'
import { getAppConfig } from '../config'

export async function getEidosFileSystemManager() {
    const userDataPath = getAppConfig().dataFolder
    const dirHandle = await getOriginPrivateDirectory(nodeAdapter, userDataPath)
    return new EidosFileSystemManager(dirHandle as any)
}