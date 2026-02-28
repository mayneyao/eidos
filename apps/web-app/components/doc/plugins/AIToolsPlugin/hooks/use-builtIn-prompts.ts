import { TaskType } from "@/components/settings/global/ai/hooks"

export const useBuiltInPrompts = () => {
  return [
    {
      id: "translate",
      name: "Translate",
      type: TaskType.Translation,
      icon: "Languages",
      content: `Translate the given text to {{languages}}. You are a professional translator. Follow these rules:
1. Translate the text accurately while maintaining the original meaning and tone.
3. Return only the translated text without any additional explanations or comments.
4. Preserve any formatting or special characters present in the original text.`,
      parameters: [
        {
          name: "Target language",
          key: "languages",
          value: [
            "English",
            "Chinese",
            "Spanish",
            "Arabic",
            "Hindi",
            "French",
            "Russian",
            "Portuguese",
            "German",
            "Japanese",
            "Korean",
          ],
          type: "select",
          description: "The target language to translate to.",
          required: true,
        },
      ],
    },
    {
      id: "mermaid",
      name: "Mermaid",
      type: TaskType.Coding,
      icon: "Network",
      content: `Generate a mermaid diagram from the given text. Follow these rules:
1. Always return the mermaid code that best matches the user's intent, providing the most likely chart type.
2. Ensure the generated chart is clear, concise, and easy to understand. Intelligently infer the most suitable chart type based on the context (flowcharts, sequence diagrams, Gantt charts, etc). Optimize layout for readability.
3. For node text containing special characters, use proper HTML entity encoding where needed (e.g., &quot; for quotes).
4. When defining nodes like A[Text], wrap any text containing spaces or special characters in double quotes and use HTML entities inside them.
5. Return only the mermaid content without explanations, enclosed in a markdown code block with language specified as mermaid.
6. Test your generated diagram syntax mentally before returning it to ensure it's valid and properly escaped.`,
    },
  ]
}
