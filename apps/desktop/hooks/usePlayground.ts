import { isDesktopMode } from "@/lib/env";
import { useEffect } from "react";
export interface PlaygroundFile {
    name: string;
    content: string;
}

export interface PlaygroundOptions {
    onChange: (filename: string, content: string, space: string, blockId: string) => void
}

export const usePlayground = ({ onChange }: PlaygroundOptions) => {

    const initializePlayground = async (space: string, blockId: string, files: PlaygroundFile[]) => {
        if (!isDesktopMode) {
            return;
        }
        return await window.eidos.initializePlayground(space, blockId, files);
    };

    useEffect(() => {
        if (!isDesktopMode) {
            return;
        }
        const handlePlaygroundFileChanged = (event: any, data: { filename: string; content: string; space: string; blockId: string; }) => {
            onChange(data.filename, data.content, data.space, data.blockId);
        };
        const listenerId = window.eidos.on('playground-file-changed', handlePlaygroundFileChanged);
        return () => {
            if (listenerId) {
                window.eidos.off('playground-file-changed', listenerId);
            }
        };
    }, []);

    return {
        initializePlayground
    };
};
