import { z } from "zod"

const saveFile2EFS = {
  name: "saveFile2EFS",
  description: "save file to opfs, return file object",
  schema: z
    .object({
      url: z.string({
        description: "url of file",
      }),
      subPath: z
        .array(z.string(), {
          description: "subPath of file",
        })
        .optional(),
      filename: z
        .string({
          description: "filename of file",
        })
        .optional(),
    })
    .describe("save file to opfs"),
}

export default saveFile2EFS
