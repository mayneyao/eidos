import { useIndexedDB } from "@/apps/web-app/hooks/use-indexed-db";
import type { IExtension } from "@/packages/core/meta-table/extension";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useExtension } from "../../../web-app/hooks/use-extension";
import { EIDOS_SPACE_BASE_URL } from "@/lib/const";
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite";


export const useExtensionInstaller = () => {
    const navigate = useNavigate();
    const { addExtension } = useExtension();
    const { sqlite } = useSqlite();
    const [lastOpenedDatabase,] = useIndexedDB(
        "kv",
        "lastOpenedDatabase",
        ""
    );

    const installExtension = useCallback(async (extensionId: string) => {
        try {
            const response = await fetch(`${EIDOS_SPACE_BASE_URL}/api/extensions/${extensionId}/download`);
            if (!response.ok) {
                throw new Error(`Failed to fetch extension: ${response.statusText}`);
            }
            const extensionData = await response.json();

            const extensionIdFromApi = extensionData.extension.id;

            if (sqlite) {
                const existingScript = await sqlite.script.get(extensionIdFromApi);
                if (existingScript) {
                    console.log(`Extension ${extensionIdFromApi} already installed. Navigating...`);
                    if (lastOpenedDatabase) {
                        navigate(`/${lastOpenedDatabase}/extensions/${existingScript.id}`);
                    }
                    return;
                }
            }

            const script: IExtension = {
                id: extensionIdFromApi,
                name: extensionData.extension.name,
                type: extensionData.extension.type,
                description: extensionData.extension.description,
                icon: extensionData.extension.icon_url,
                version: extensionData.latestVersion.version,
                ...(extensionData.extension.type === 'block' || extensionData.extension.type === 'script'
                    ? { ts_code: extensionData.latestVersion.code, code: '' }
                    : { code: extensionData.latestVersion.code }),
                enabled: true,
            };

            await addExtension(script);
            console.log(`Successfully installed extension: ${extensionId}`);
            if (lastOpenedDatabase) {
                navigate(`/${lastOpenedDatabase}/extensions/${script.id}`);
            }


        } catch (error) {
            console.error("Error handling extension protocol action:", error);
            // TODO: Show error to user?
        }
    }, [addExtension, navigate, lastOpenedDatabase, sqlite]);

    return { installExtension };
};
