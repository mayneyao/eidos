import type { ExtensionContext } from "@eidos.space/extension-sdk"

export function activate(context: ExtensionContext) {
  context.subscriptions.add(
    context.commands.register("example.hello-eidos.greet", async (resource) => {
      const text = await context.space.files.readText(resource.path)

      context.window.showNotice(
        `Hello from ${resource.path} (${text.length} characters)`
      )
    })
  )
}
