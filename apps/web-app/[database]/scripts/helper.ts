import z from "zod"

import { toast } from "@/components/ui/use-toast"

export const PromptEnableCheck = z.object({
  model: z.string().refine((value) => value.trim() !== "", {
    message: "Model cannot be empty",
    path: ["model"],
  }),
  actions: z.array(z.string()).nullable().optional(),
})

export const checkPromptEnable = (data: unknown) => {
  const result = PromptEnableCheck.safeParse(data)
  if (!result.success) {
    toast({
      title: `please check your settings`,
      description: `[${result.error.errors[0].path}]: ${result.error.errors[0].message}`,
    })
    throw new Error(result.error.errors[0].message)
  }
  return result.data
}
