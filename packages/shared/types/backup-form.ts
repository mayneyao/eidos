import { z } from "zod"

export const backupServerFormSchema = z.object({
    Github__repo: z
        .string({
            description: "The Github Repo.",
            required_error: "Github Repo is required.",
        })
        .optional(),
    Github__token: z
        .string({
            description: "The Github Token.",
            required_error: "Github Token is required.",
        })
        .optional(),
    Github__enabled: z
        .boolean({
            description: "Enable Github Backup.",
        })
        .optional(),
    S3__endpointUrl: z
        .string({
            description: "The URL of AWS/R2 Endpoint.",
            required_error: "AWS/R2 Endpoint URL is required.",
        })
        .optional(),
    S3__accessKeyId: z
        .string({
            description: "The AWS/R2 Access Key ID.",
            required_error: "AWS/R2 Access Key ID is required.",
        })
        .optional(),
    S3__secretAccessKey: z
        .string({
            description: "The AWS/R2 Secret Access Key.",
            required_error: "AWS/R2 Secret Access Key is required.",
        })
        .optional(),
    S3__enabled: z
        .boolean({
            description: "Enable S3 Backup.",
        })
        .optional(),
    spaceList: z.string().optional(),
    autoSaveGap: z.number({
        description:
            "The time gap between auto save. eg: 5 means every 5 minutes will auto save once.",
    }),
})

export type BackupServerFormValues = z.infer<typeof backupServerFormSchema>