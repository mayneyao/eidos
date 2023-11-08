import { z } from "zod"

const saveFile2OPFS = {
  name: "saveFile2OPFS",
  description: "save file to opfs, return file object",
  schema: z
    .object({
      url: z.string({
        description: "url of file",
      }),
      filename: z
        .string({
          description: "filename of file",
        })
        .optional(),
    })
    .describe("save file to opfs"),
}

export default saveFile2OPFS
