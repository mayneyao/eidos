export const meta = {
  type: "tool",
  funcName: "hello",
  tool: {
    name: "hello",
    description: "This is a hello world tool",
    inputJSONSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
      },
    },
    outputJSONSchema: {
      type: "string",
    },
  },
}

export function hello({ name }: { name: string }) {
  return `Hello, ${name}!`
}
