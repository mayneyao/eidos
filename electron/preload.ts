import { EidosFileSystemManager } from '@/lib/storage/eidos-file-system'
import { SpaceFileSystem } from '@/lib/storage/space';
import { contextBridge, ipcRenderer } from 'electron'
import { getOriginPrivateDirectory } from 'native-file-system-adapter'

import nodeAdapter from './lib/node-adapter'
import { ConfigManager } from './config/index'

async function main() {
  const userConfigPath = (await ipcRenderer.invoke('get-user-config-path'));
  const userDataPath = (await ipcRenderer.invoke('get-app-config')).dataFolder;
  const openTabs = await ipcRenderer.invoke('get-open-tabs') as string[]
  const dirHandle = await getOriginPrivateDirectory(nodeAdapter, userDataPath)
  const configManager = new ConfigManager(userConfigPath);

  // --------- Expose some API to the Renderer process ---------
  contextBridge.exposeInMainWorld('eidos', {
    on(...args: Parameters<typeof ipcRenderer.on>) {
      const [channel, listener] = args
      return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
      const [channel, ...omit] = args
      return ipcRenderer.off(channel, ...omit)
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
      const [channel, ...omit] = args
      return ipcRenderer.send(channel, ...omit)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
      const [channel, ...omit] = args
      return ipcRenderer.invoke(channel, ...omit)
    },
    postMessage(...args: Parameters<typeof ipcRenderer.postMessage>) {
      const [channel, ...omit] = args
      return ipcRenderer.postMessage(channel, ...omit)
    },
    openTabs: openTabs,
    // versions
    chrome: process.versions.chrome,
    node: process.versions.node,

    efsManager: new EidosFileSystemManager(dirHandle as any),
    spaceFileSystem: new SpaceFileSystem(dirHandle as any),
    config: {
      get: (key: string) => configManager.get(key),
      set: (key: string, value: any) => configManager.set(key, value),
    },
    isDataFolderSet: !!configManager.get('dataFolder'),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    reloadApp: () => ipcRenderer.invoke('reload-app')
    // You can expose other APIs you need here.
    // ...
  })
}

main()
