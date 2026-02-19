import { useChat } from "@ai-sdk/react"
import { useTranslation } from "react-i18next"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { toast } from "@/components/ui/use-toast"
import { uuidv7 } from "@/lib/utils"
import { TaskType } from "@/components/settings/global/ai/hooks"
import { useState, useCallback, useRef, useMemo } from "react"

export function useGenerateTitle() {
    const { t } = useTranslation()
    const { findAvailableModel, getConfigByModel } = useAiConfig()
    const model = findAvailableModel(TaskType.Translation)
    const [title, setTitle] = useState("")
    const resolveRef = useRef<((value: string) => void) | null>(null)

    const config = useMemo(() => {
        try {
            return getConfigByModel(model)
        } catch (error) {
            return {}
        }
    }, [model])

    const { setMessages, regenerate, status } = useChat({
        onError(error) {
            toast({
                title: error.message || t("common.error.tryAgainLater"),
                description: t("common.error.modelLimitation"),
            })
            resolveRef.current?.("")
        },
        // Note: `body` is removed in v6, config should be handled via provider setup
        onFinish(message) {
            // Extract text from parts array instead of content
            const textPart = message.parts?.find(part => part.type === 'text')
            const generatedTitle = textPart?.text?.trim() || ''
            setTitle(generatedTitle)
            resolveRef.current?.(generatedTitle)
        },
    })

    const generateTitle = useCallback(async (content: string): Promise<string> => {
        if (!model) {
            toast({
                title: "No model available",
                description: "Please config a model",
            })
            return ""
        }

        return new Promise<string>((resolve) => {
            resolveRef.current = resolve

            setMessages([
                {
                    id: uuidv7(),
                    role: "system",
                    // Use parts array instead of content
                    parts: [{ type: 'text', text: `You are a helpful assistant that generates concise and descriptive titles. Analyze the given content and generate a short, meaningful title (no more than 6 words) in the SAME LANGUAGE as the input content. Only output the title without any additional explanation or punctuation.

For example:
If the content is in English: "The process of brewing coffee involves several steps...", output: How to Make Perfect Coffee
If the content is in Chinese: "咖啡的冲泡过程包含以下步骤...", output: How to brew perfect coffee
If the content is in Japanese: "コーヒーの淹れ方について説明します...", output: How to brew perfect coffee

Content:` }],
                },
                {
                    id: uuidv7(),
                    role: "user",
                    // Use parts array instead of content
                    parts: [{ type: 'text', text: content }],
                },
            ])

            // reload() -> regenerate()
            regenerate()
        })
    }, [model, setMessages, regenerate])

    // Convert status to isLoading boolean for backward compatibility
    const isLoading = status === 'submitted' || status === 'streaming'

    return {
        generateTitle,
        isLoading,
        title,
    }
}
