import { useState, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import type { IExtension } from "@/packages/core/meta-table/extension";
import { getEditorLanguage } from "../helper";
import { useExtension } from "../../../../hooks/use-extension";
import { EIDOS_SPACE_BASE_URL } from "@/lib/const";
import { isUuid } from "@/lib/utils";

interface UseExtensionMarketplaceProps {
    script: IExtension;
    editorContent: string;
    apiKey?: string;
}

// Define input structure for publishing a new version, mirroring the backend
interface PublishNewVersionPayload {
    version?: string;
    code: string;
    changelog?: string;
    language?: string; // Optional, to allow language updates
}

// Define the structure for the latestVersion API response
interface LatestVersionResponse {
    id: string;
    extension_id: string;
    version: string;
    code: string;
    language: string | null;
    changelog: string;
    is_published: number; // Assuming 1 for true, 0 for false based on typical DB boolean representation
    download_count: number;
    created_at: string; // ISO date string
}


export const useExtensionMarketplace = ({ script, editorContent, apiKey }: UseExtensionMarketplaceProps) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false); // Add state for publishing
    const { toast } = useToast();
    const { updateExtension } = useExtension();

    // check update
    const checkUpdate = useCallback(async (): Promise<LatestVersionResponse | null> => {
        if (!isUuid(script.id)) {
            return null
        }
        const marketplaceId = script.id
        if (!marketplaceId) {
            // Optionally, handle this case more specifically, e.g., return null or throw an error
            console.warn("Marketplace ID is missing, cannot check for updates.");
            return null;
        }
        const url = `${EIDOS_SPACE_BASE_URL}/api/extensions/${marketplaceId}/latestVersion`;
        const response = await fetch(url, {
            method: "GET",
        });
        const result: LatestVersionResponse = await response.json();
        return result;
    }, [script?.marketplace_id]);

    const submitExtension = useCallback(async () => {
        if (!script || !editorContent) {
            toast({
                variant: "destructive",
                title: "Submission Failed",
                description: "Missing script data or content.",
            });
            return;
        }
        if (!apiKey) {
            toast({
                variant: "destructive",
                title: "Submission Failed",
                description: "API Key is missing.",
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const codeToSubmit = editorContent;
            const scriptLanguage = getEditorLanguage(script);

            const payload = {
                name: script.name || `Extension ${script.id}`,
                version: "0.0.1", // Consider making this dynamic
                code: codeToSubmit,
                description: script.description || "",
                type: script.meta?.type ? `${script.type}/${script.meta.type}` : script.type,
                language: scriptLanguage,
                icon_url: script.icon,
                changelog: "Initial submission", // Consider making this dynamic
                initialStatus: "public",
                publishFirstVersion: true,
            };

            const response = await fetch(
                `${EIDOS_SPACE_BASE_URL}/api/extensions/submit`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        'x-api-key': apiKey,
                    },
                    body: JSON.stringify(payload),
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.error || `HTTP error! status: ${response.status}`
                );
            }

            toast({
                title: "Extension Submitted Successfully",
                description: `Extension ID: ${result.extensionId}`,
            });

            await updateExtension({
                ...script,
                marketplace_id: result.extensionId,
            });
        } catch (error: any) {
            console.error("Error submitting extension:", error);
            toast({
                variant: "destructive",
                title: "Submission Failed",
                description: error.message || "An unknown error occurred.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }, [script, editorContent, toast, updateExtension, apiKey]);

    const publishNewVersion = useCallback(async () => {
        if (!script?.marketplace_id) {
            toast({
                variant: "destructive",
                title: "Publish Failed",
                description: "Missing extension ID. Has the extension been submitted initially?",
            });
            return;
        }
        if (!apiKey) {
            toast({
                variant: "destructive",
                title: "Publish Failed",
                description: "API Key is missing.",
            });
            return;
        }

        const payload = {
            code: editorContent,
            changelog: "Updated",
        }
        if (!payload.code) {
            toast({
                variant: "destructive",
                title: "Publish Failed",
                description: "Version and code are required.",
            });
            return;
        }

        setIsPublishing(true);
        try {
            const extensionId = script.marketplace_id;
            const apiPayload: PublishNewVersionPayload & { language?: string } = {
                ...payload,
                code: editorContent, // Ensure we are using the latest editor content for the code
            };


            const response = await fetch(
                `${EIDOS_SPACE_BASE_URL}/api/extensions/${extensionId}/publishNewVersion`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        'x-api-key': apiKey,
                    },
                    body: JSON.stringify(apiPayload),
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.error || `HTTP error! status: ${response.status}`
                );
            }

            toast({
                title: "New Version Published Successfully",
                description: `Version ID: ${result.versionId}`,
            });

            // Potentially update local script state if needed, e.g., new version number
            // await updateExtension({ ...script, version: payload.version }); // Example

        } catch (error: any) {
            console.error("Error publishing new version:", error);
            toast({
                variant: "destructive",
                title: "Publish Failed",
                description: error.message || "An unknown error occurred.",
            });
        } finally {
            setIsPublishing(false);
        }
    }, [script, editorContent, toast, apiKey]);

    return {
        isSubmitting,
        submitExtension,
        isPublishing,
        publishNewVersion,
        checkUpdate,
    };
}; 