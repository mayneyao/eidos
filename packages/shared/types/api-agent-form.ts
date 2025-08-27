import { z } from "zod"


export const apiAgentFormSchema = z.object({
    url: z.string({
        description: "The URL of your api agent",
    }),
    enabled: z.boolean({
        description: "Whether to enable api agent",
    }),
})

export type APIAgentFormValues = z.infer<typeof apiAgentFormSchema>