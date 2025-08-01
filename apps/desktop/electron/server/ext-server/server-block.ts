import type { DataSpace } from '@/packages/core/DataSpace';
import type { IExtension } from "@/packages/core/meta-table/extension";
import { extractFunction } from "@/packages/v3/code-tools/code-extractor";
import { generateImportMap, getAllLibs } from "@/packages/v3/code-tools/get-deps";
import vm from 'vm';
import { getOrSetDataSpace } from "../../data-space";
import { getIndexHtml } from "./ext-html";
import { presetThemes, twConfig } from "./helper";


import type { ConfigManager } from "@/apps/desktop/electron/config";
import { getConfigManager } from "@/apps/desktop/electron/config";
import type { IBindings } from "@/packages/core/types/IExtension";
import { makeSdkInjectScript } from "@/packages/sandbox/helper";
import { uiComponentsDependencies } from "./ui-deps";


export class ServerBlock {
    private configManager: ConfigManager
    constructor(
    ) {
        this.configManager = getConfigManager()
    }

    runServerAction = async (code: string, dataSpace: DataSpace, url: string) => {
        const sandbox = {
            console: { log: console.log },
            context: {
                currentSpace: dataSpace,
                request: {
                    url,
                },
            },
            URL: URL,
        };
        vm.createContext(sandbox);
        const res = await vm.runInNewContext(code, sandbox, {
            timeout: 3000,
        });
        return res
    }

    async handleServerAction(code: string, dataSpace: DataSpace, url: string) {
        const serverActionFunctionRawCode = extractFunction(code, 'getServerSideProps')
        if (serverActionFunctionRawCode) {
            const serverActionCode = `(${serverActionFunctionRawCode})(context)`
            try {
                const res = await this.runServerAction(serverActionCode, dataSpace, url)
                return res
            } catch (error) {
                console.error("Error running server action", error)
            }
        }
        return null
    }

    getThemeRawCss(themeName?: string) {
        const customThemes = this.configManager.get('theme').customThemes
        const currentThemeName = this.configManager.get('theme').currentThemeName
        const allThemes = [...presetThemes, ...(customThemes || [])]
        if (themeName) {
            const theme = allThemes.find((theme) => theme.name === themeName)
            if (theme) {
                return theme.css
            }
        }
        const theme = allThemes.find((theme) => theme.name === currentThemeName)
        if (theme) {
            return theme.css
        }
        return ''
    }

    static getEnvMap(bindings?: IBindings) {

        const envMap: Record<string, string> = {}
        if (!bindings) {
            return envMap
        }
        // exclude table bindings
        Object.entries(bindings).forEach(([key, value]) => {
            if (value.type === "secret" || value.type === "text") {
                envMap[key] = value.value
            }
        })
        return envMap
    }
    async run(spaceId: string, extension: IExtension | null, url: string) {
        const dataSpace = await getOrSetDataSpace(spaceId);
        const start = performance.now()
        const sdkInjectScriptContent = makeSdkInjectScript({
            space: spaceId,
            bindings: extension?.bindings,
        })
        const code = extension?.ts_code || ""
        const compiledCode = extension?.code || ""

        const { thirdPartyLibs, uiLibs, cssLibs, localLibs } = getAllLibs(code, uiComponentsDependencies)
        const res = await this.handleServerAction(code, dataSpace, url)
        console.log("server action result", res)
        // // preload some libs
        thirdPartyLibs.push(
            "@radix-ui/react-icons",
            "@radix-ui/react-toast",
            "class-variance-authority",
            "lucide-react"
        )
        uiLibs.push("toast", "toaster", "use-toast")
        const envString = JSON.stringify(ServerBlock.getEnvMap(extension?.bindings))
        const defaultPropsString = JSON.stringify({})
        const { importMapScript, cssLoaderScript } = await generateImportMap({ thirdPartyLibs, uiLibs, cssLibs, localLibs }, spaceId)
        // // Placeholder for BlockRenderer server-side logic
        const themeRawCode = this.getThemeRawCss()
        const html = getIndexHtml({
            theme: 'light',
            importMap: importMapScript,
            cssLoaderScript,
            sdkInjectScriptContent,
            envString,
            twConfig,
            compiledCode,
            defaultPropsString,
            serverSideProps: res?.props || {},
            rawThemeCss: themeRawCode
        })
        const end = performance.now()
        console.log(`ServerBlock took ${end - start}ms`)
        return html
    }
}