import { z } from "zod"

const createDoc = {
  name: "createDoc",
  description: "create a doc with markdown",
  schema: z.object({
    markdown: z.string({
      description: "markdown content",
    }),
  }),
}

export default createDoc
