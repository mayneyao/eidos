import { EidosFileSystemManager } from '@/lib/storage/eidos-file-system'
import { getOriginPrivateDirectory } from 'native-file-system-adapter'
import nodeAdapter from 'native-file-system-adapter/src/adapters/node'
import { getAppConfig } from '../config'
import path from 'path';
import fs from 'fs/promises';
import { watch } from 'fs';
import { win } from '../main';

export interface PlaygroundFile {
    name: string;
    content: string;
}

export async function getEidosFileSystemManager() {
    const userDataPath = getAppConfig().dataFolder
    const dirHandle = await getOriginPrivateDirectory(nodeAdapter, userDataPath)
    return new EidosFileSystemManager(dirHandle as any)
}


export interface FileChangeCallback {
    onChange: (filename: string, content: string) => void;
}
export function watchPlayground(
    playgroundPath: string,
    callback: FileChangeCallback
) {
    const debounceMap = new Map<string, NodeJS.Timeout>();
    const contentCache = new Map<string, string>();

    const watcher = watch(
        playgroundPath,
        { recursive: true },
        async (eventType, filename) => {
            if (filename) {
                if (debounceMap.has(filename)) {
                    clearTimeout(debounceMap.get(filename));
                }

                debounceMap.set(filename, setTimeout(async () => {
                    try {
                        const filePath = path.join(playgroundPath, filename);
                        const content = await fs.readFile(filePath, 'utf-8');

                        if (content !== contentCache.get(filename)) {
                            contentCache.set(filename, content);
                            callback.onChange(filename, content);
                        }

                        debounceMap.delete(filename);
                    } catch (error) {
                        console.error(`Error reading file ${filename}:`, error);
                    }
                }, 300));
            }
        }
    );

    return watcher;
}

// 添加一个 Map 来存储每个 playground 的 watcher
const watcherMap = new Map<string, ReturnType<typeof watch>>();

export async function initializePlayground(
    space: string,
    blockId: string,
    files: PlaygroundFile[]
) {
    const userDataPath = getAppConfig().dataFolder
    const playgroundPath = path.join(userDataPath, "playground", `${space}-${blockId}`)

    // 清理旧的 watcher
    const watcherId = `${space}-${blockId}`;
    if (watcherMap.has(watcherId)) {
        watcherMap.get(watcherId)?.close();
        watcherMap.delete(watcherId);
    }

    try {
        await fs.rm(playgroundPath, { recursive: true, force: true });
    } catch (error) {
    }

    await fs.mkdir(playgroundPath, { recursive: true });

    for (const file of files) {
        await fs.writeFile(
            path.join(playgroundPath, file.name),
            file.content
        );
    }

    // 保存新的 watcher
    const watcher = watchPlayground(playgroundPath, {
        onChange: (filename, content) => {
            console.log(`文件 ${filename} 发生变化`);
            console.log('新的内容:', content);
            win?.webContents.send('playground-file-changed', {
                filename,
                content,
                space,
                blockId
            })
        }
    });
    watcherMap.set(watcherId, watcher);

    return playgroundPath
}

// 添加清理函数
export function cleanupPlaygroundWatchers() {
    for (const watcher of watcherMap.values()) {
        watcher.close();
    }
    watcherMap.clear();
}
