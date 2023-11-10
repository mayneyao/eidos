import { z } from "zod"

const startRecorder = {
  name: "startRecorder",
  description: "start a recorder to record screen, and return recorder id",
  schema: z.object({}).describe("no parameters"),
}

const stopRecorder = {
  name: "stopRecorder",
  description: "stop a recorder by given id, and return a blob url",
  schema: z
    .object({
      id: z.string().nonempty(),
    })
    .describe("id of recorder"),
}

export { startRecorder, stopRecorder }
