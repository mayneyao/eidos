import { EidosFileSystemManager } from '@/lib/storage/eidos-file-system';
import { SpaceFileSystem } from '@/lib/storage/space';
import { contextBridge, ipcRenderer } from 'electron';
import { getOriginPrivateDirectory } from 'native-file-system-adapter';

import { ConfigManager } from './config/index';
import { PlaygroundFile } from './file-system/manager';
import nodeAdapter from './lib/node-adapter';

type IpcListener = (event: Electron.IpcRendererEvent, ...args: any[]) => void;

async function main() {
  const userConfigPath = (await ipcRenderer.invoke('get-user-config-path'));
  const userDataPath = (await ipcRenderer.invoke('get-app-config')).dataFolder;
  const openTabs = await ipcRenderer.invoke('get-open-tabs') as string[]
  const dirHandle = await getOriginPrivateDirectory(nodeAdapter, userDataPath)
  const configManager = new ConfigManager(userConfigPath);

  const listenerMap = new Map<string, Map<string, IpcListener>>();
  let listenerIdCounter = 0;

  // --------- Expose some API to the Renderer process ---------
  contextBridge.exposeInMainWorld('eidos', {
    on(channel: string, listener: IpcListener) {
      if (!listenerMap.has(channel)) {
        listenerMap.set(channel, new Map());
      }
      
      const channelListeners = listenerMap.get(channel)!;
      const listenerId = `listener_${++listenerIdCounter}`;
      
      // 检查是否已存在
      if (channelListeners.has(listenerId)) {
        console.log(`Listener already exists for ${channel}, total: ${channelListeners.size}`);
        return;
      }
      
      const wrappedListener = (event: Electron.IpcRendererEvent, ...args: any[]) => {
        console.log(`Executing listener for ${channel}, id: ${listenerId}`);
        listener(event, ...args);
      };
      
      channelListeners.set(listenerId, wrappedListener);
      console.log(`Added listener for ${channel}, total listeners: ${channelListeners.size}, id: ${listenerId}`);
      ipcRenderer.on(channel, wrappedListener);

      // 返回listenerId，以便后续移除监听器时使用
      return listenerId;
    },
    
    off(channel: string, listenerId: string) {
      const channelListeners = listenerMap.get(channel);
      if (!channelListeners) {
        console.log(`No listeners map for channel: ${channel}`);
        return;
      }
      
      const wrappedListener = channelListeners.get(listenerId);
      
      if (wrappedListener) {
        channelListeners.delete(listenerId);
        ipcRenderer.removeListener(channel, wrappedListener);
        console.log(`Removed listener for ${channel}, remaining: ${channelListeners.size}, id: ${listenerId}`);
      } else {
        console.log(`Failed to find listener for ${channel}, id: ${listenerId}`);
      }
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
    openFolder: (folder: string) => ipcRenderer.invoke('open-folder', folder),
    reloadApp: () => ipcRenderer.invoke('reload-app'),
    initializePlayground: (space: string, blockId: string, files: PlaygroundFile[]) => ipcRenderer.invoke('initialize-playground', space, blockId, files),
    // You can expose other APIs you need here.
    // ...
  })

}

main()
