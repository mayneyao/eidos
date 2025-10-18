import { DataSpace } from "./data-space"

export { DataSpace }

export interface EidosTable<T = Record<string, string>> {
    id: string
    name: string
    fieldsMap: T
}

/**
 * eidos is the entry of the sdk
 *
 * `eidos.currentSpace.table("tableId").rows.query()`
 */
export interface Eidos {
    space(spaceName: string): DataSpace
    currentSpace: DataSpace

    /**
     * Script functionality
     */
    script: {
        /**
         * Call a specific script
         * @param scriptId The script ID
         * @param args Arguments to pass to the script
         * @returns The result of the script execution
         */
        call(scriptId: string, ...args: any[]): Promise<any>
    }

    /**
     * AI-related functionality
     */
    AI: {
        /**
         * Generate text using AI
         * @param options Generation options including model and prompt
         * @param options.model The AI model to use
         * @param options.prompt The prompt text
         * @returns The generated text
         */
        generateText(options: {
            model?: string;
            prompt: string;
            [key: string]: any;
        }): Promise<string>

        /**
         * Generate object using AI
         * @param options Generation options including model and prompt
         * @param options.model The AI model to use
         * @param options.prompt The prompt text
         * @param options.schema The json schema of the object
         * @returns The generated object
         */
        generateObject(options: {
            model?: string;
            prompt: string;
            schema: Record<string, any>;
            [key: string]: any;
        }): Promise<Record<string, any>>
    }

    utils: {
        /**
         * we can't use fetch directly in the iframe, so we need to use this method to fetch resource
         * Note: it return Blob, not Response
         * 
         * for example:
         * 
         * const blob = await eidos.fetchBlob("https://example.com/file.zip", {
         *   method: "GET",
         *   headers: {
         *     "Content-Type": "application/zip",
         *   },
         * })
         * 
         * @param url 
         * @param options 
         * @returns
         */
        fetchBlob(url: string, options: RequestInit): Promise<Blob>

        /**
         * highlight the row if it is in the current view
         * @param tableId 
         * @param rowId 
         * @param fieldId 
         */
        tableHighlightRow(tableId: string, rowId: string, fieldId?: string): void
    }
}

