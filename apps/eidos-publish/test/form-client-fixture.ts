import type { PublicFormDocumentDefinition } from "../src/contracts"

export const formClientFixture: PublicFormDocumentDefinition = {
  spec: "eidos.publish/public-form@1",
  publicationVersionId: "0198c72d-82b5-7000-8000-000000000099",
  presentation: {
    title: "Product feedback",
    description: "Tell us what should improve.\n欢迎反馈问题和建议。",
    submitLabel: "Send feedback",
    successMessage: "感谢反馈！\nThank you. Your response was received.",
  },
  fields: [
    {
      inputKey: "input_message_000001",
      type: "text",
      label: "Feedback",
      description: null,
      placeholder: "What should improve?",
      multiline: true,
      required: true,
      constraints: { maxBytes: 65536 },
    },
    {
      inputKey: "input_file_000000001",
      type: "file",
      label: "Attachment",
      description: null,
      placeholder: null,
      multiline: false,
      required: false,
      constraints: { multiple: false },
    },
  ],
}
