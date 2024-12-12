import { useCurrentUser } from "@/hooks/user-current-user"
import { EidosProtocolUrlChannelName } from "@/lib/const"
import { isDesktopMode } from "@/lib/env"
import { getSqliteProxy } from "@/lib/sqlite/channel"
import { getToday, uuidv7 } from "@/lib/utils"
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

export const useDataFolderCheck = () => {
    const [isDataFolderSet, setIsDataFolderSet] = useState<boolean>(window.eidos.isDataFolderSet)

    useEffect(() => {
        const checkDataFolder = async () => {
            const dataFolder = await window.eidos.config.get("dataFolder")
            setIsDataFolderSet(!!dataFolder)
        }

        checkDataFolder()
    }, [])

    return isDataFolderSet
}

interface PlaygroundFile {
    name: string;
    content: string;
}

interface PlaygroundOptions {
    onChange: (filename: string, content: string, space: string, blockId: string) => void
}
export const usePlayground = ({ onChange }: PlaygroundOptions) => {

    const initializePlayground = async (space: string, blockId: string, files: PlaygroundFile[]) => {
        if (!isDesktopMode) {
            return
        }
        return await window.eidos.initializePlayground(space, blockId, files)
    }

    useEffect(() => {
        if (!isDesktopMode) {
            return
        }
        const handlePlaygroundFileChanged = (event: any, data: { filename: string, content: string, space: string, blockId: string }) => {
            onChange(data.filename, data.content, data.space, data.blockId)
        }
        const listenerId = window.eidos.on('playground-file-changed', handlePlaygroundFileChanged)
        return () => {
            if (listenerId) {
                window.eidos.off('playground-file-changed', listenerId)
            }
        }
    }, [])

    return {
        initializePlayground
    }
}



export const useProtocolUrl = () => {
    const navigate = useNavigate()
    const { id: userId } = useCurrentUser()
    const listenerRef = useRef<any>()

    const createDocWithMarkdown = useCallback(async (props: {
        spaceId: string, docId: string, markdown: string, title?: string, mode?: "replace" | "append" | "prepend"
    }) => {
        const { spaceId, docId, markdown, title, mode } = props
        const sqlite = getSqliteProxy(spaceId, userId || "")
        console.log('Start creating doc:', new Date().toISOString())
        await sqlite?.createOrUpdateDocWithMarkdown(docId, markdown, undefined, title, mode)

        let attempts = 0
        const maxAttempts = 10
        while (attempts < maxAttempts) {
            console.log('Polling attempt', attempts + 1, 'at:', new Date().toISOString())
            const doc = await sqlite?.getDoc(docId)
            if (doc) {
                console.log('Document found at:', new Date().toISOString())
                break
            }
            await new Promise(resolve => setTimeout(resolve, 200))
            attempts++
        }

        console.log('Navigating at:', new Date().toISOString())
    }, [navigate, userId])

    const handleProtocolUrl = useCallback(async (event: any, data: any) => {
        console.log('handleProtocolUrl called at:', new Date().toISOString(), {
            event,
            data,
            stack: new Error().stack
        });
        const { action, searchParams } = data;
        let content = searchParams['content'] || ""
        if ('clipboard' in searchParams) {
            content = await navigator.clipboard.readText()
        }
        switch (action) {
            case 'open':
                // 处理打开空间或特定视图
                if ('space' in searchParams) {
                    const spaceId = searchParams['space'];

                }
                break;

            case 'search':
                // 处理搜索请求
                if ('space' in searchParams) {
                    const spaceId = searchParams['space'];
                }
                break;

            case 'new':
                if ('space' in searchParams) {
                    const spaceId = searchParams['space'];
                    let title = searchParams['file'] || searchParams['title'] || ""
                    console.log({ spaceId, content, title })
                    const docId = uuidv7().replace(/-/g, '')
                    await createDocWithMarkdown({ spaceId, docId, markdown: content, title, mode: "replace" })
                    navigate(`/${spaceId}/${docId}`)
                }
                break;

            case 'daily':
                const spaceId = searchParams['space'];
                const date = getToday()
                const docId = date;

                if ('append' in searchParams) {
                    await createDocWithMarkdown({ spaceId, docId, markdown: content, title: undefined, mode: "append" })
                } else if ('prepend' in searchParams) {
                    await createDocWithMarkdown({ spaceId, docId, markdown: content, title: undefined, mode: "prepend" })
                } else {
                    navigate(`/${spaceId}/everyday/${date}`);
                }
                break;

            default:
                console.warn('Unhandled protocol action:', action);
        }
    }, [createDocWithMarkdown]);

    useEffect(() => {
        if (!isDesktopMode) return;

        // 保存监听器引用
        listenerRef.current = handleProtocolUrl;

        console.log('register protocol url listener');
        const listenerId = window.eidos.on(EidosProtocolUrlChannelName, listenerRef.current);
        console.log('listenerId', listenerId)

        return () => {
            console.log('unregister protocol url listener');
            if (listenerId) {
                window.eidos.off(EidosProtocolUrlChannelName, listenerId);
            }
        };
    }, [handleProtocolUrl]);
}