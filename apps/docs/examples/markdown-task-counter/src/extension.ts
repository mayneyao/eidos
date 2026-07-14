import type { ExtensionContext } from "@eidos.space/extension-sdk"

export function activate(context: ExtensionContext) {
  context.subscriptions.add(
    context.commands.register(
      "example.markdown-task-counter.count-tasks",
      async (resource) => {
        const text = await context.space.files.readText(resource.path)
        const open = text.match(/^\s*[-*]\s+\[ \]/gim)?.length ?? 0
        const completed = text.match(/^\s*[-*]\s+\[[xX]\]/gim)?.length ?? 0

        context.window.showNotice(
          `${resource.path}: ${open} open, ${completed} completed`
        )
      }
    )
  )
}
