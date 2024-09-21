import { z } from "zod"

const createDoc = {
  name: "createDoc",
  description: "create a doc with markdown",
  schema: z.object({
    title: z.string({
      description: "doc title",
    }),
    markdown: z.string({
      description: "markdown content",
    }),
  }),
}

export default createDoc
