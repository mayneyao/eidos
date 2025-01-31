import { useChat } from "ai/react"
import { useTranslation } from "react-i18next"
import { useAiConfig } from "@/hooks/use-ai-config"
import { toast } from "@/components/ui/use-toast"
import { uuidv7 } from "@/lib/utils"
import { TaskType } from "@/apps/web-app/settings/ai/hooks"
import { useState, useCallback, useRef } from "react"

export function useGenerateTitle() {
    const { t } = useTranslation()
    const { findAvailableModel, getConfigByModel } = useAiConfig()
    const model = findAvailableModel(TaskType.Translation)
    const [title, setTitle] = useState("")
    const resolveRef = useRef<((value: string) => void) | null>(null)

    const { setMessages, reload, isLoading } = useChat({
        onError(error) {
            toast({
                title: error.message || t("common.error.tryAgainLater"),
                description: t("common.error.modelLimitation"),
            })
            resolveRef.current?.("")
        },
        body: {
            ...getConfigByModel(model),
            model,
            useTools: false,
        },
        onFinish(message) {
            const generatedTitle = message.content.trim()
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
                    content: `You are a helpful assistant that generates concise and descriptive titles. Analyze the given content and generate a short, meaningful title (no more than 6 words) in the SAME LANGUAGE as the input content. Only output the title without any additional explanation or punctuation.

For example:
If the content is in English: "The process of brewing coffee involves several steps...", output: How to Make Perfect Coffee
If the content is in Chinese: "咖啡的冲泡过程包含以下步骤...", output: 如何冲泡完美咖啡
If the content is in Japanese: "コーヒーの淹れ方について説明します...", output: 完璧なコーヒーの淹れ方

Content:`,
                    role: "system",
                },
                {
                    id: uuidv7(),
                    content: content,
                    role: "user",
                },
            ])

            reload()
        })
    }, [model, setMessages, reload])

    return {
        generateTitle,
        isLoading,
        title,
    }
} 