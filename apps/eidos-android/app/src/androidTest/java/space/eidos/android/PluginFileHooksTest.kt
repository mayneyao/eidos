package space.eidos.android

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PluginFileHooksTest {
    @Test fun savesRenamesAndDisablesIsolatedFileHooks() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val space = SpaceCatalog(context).create("Hooks ${UUID.randomUUID()}").id
        val repository = SpaceRepository(context, space)
        val store = PluginMarketStore(context)
        val id = "test.file-hooks"
        val manifest = JSONObject().put("apiVersion", 1).put("id", id).put("name", "Hooks").put("version", "1.0.0")
            .put("requires", JSONObject().put("pluginApi", "3.3.0")).put("extension", "./main.js")
            .put("hooks", JSONArray(listOf(
                JSONObject().put("id", "save").put("title", "Saved").put("event", "document.saved").put("extensions", JSONArray(listOf(".md"))).put("access", "write"),
                JSONObject().put("id", "rename").put("title", "Renamed").put("event", "file.renamed").put("extensions", JSONArray(listOf(".md"))).put("access", "write"),
            )))
        val code = """export default ctx => {
          ctx.subscriptions.add(ctx.capabilities.hooks.register('save', ({event}) => {
            const title = /^# (.+)/.exec(event.document.text)?.[1];
            return title && title !== /^# (.+)/.exec(event.previousText ?? '')?.[1] ? {name:title+'.md'} : undefined;
          }));
          ctx.subscriptions.add(ctx.capabilities.hooks.register('rename', ({event}) => {
            const name = event.path.split('/').pop().slice(0,-3);
            return event.document.text.startsWith('# ') ? {text:event.document.text.replace(/^# [^\n]+/, '# '+name)} : undefined;
          }));
        }"""
        val json = JSONObject().put("format", 2).put("manifest", manifest).put("modules", JSONObject().put("./main.js", code)).toString()
        val prepared = PreparedPlugin(json, manifest, PluginMarketTransport.hash(json.toByteArray()))
        try {
            store.install(prepared, space)
            val old = repository.create("", "Old", "markdown")
            val initial = repository.readText(old)
            // Initial creation triggers the same ordinary save boundary.
            val saved = repository.saveText(initial.copy(text = "# New\nBody"))
            assertEquals("New.md", saved.path)
            assertEquals("# New\nBody", repository.readText(saved.path).text)
            val index = repository.create("", "index", "markdown")
            repository.saveText(repository.readText(index).copy(text = "[link](New.md) [[New]] `[[New]]`"))
            val renamed = repository.rename(saved.path, "Final.md")
            assertEquals("Final.md", renamed)
            assertEquals("# Final\nBody", repository.readText(renamed).text)
            assertEquals("[link](Final.md) [[Final]] `[[New]]`", repository.readText(index).text)
            store.setEnabled(space, store.installed(space).single { it.id == id }, false)
            val changed = repository.saveText(repository.readText(renamed).copy(text = "# Disabled"))
            assertEquals("Final.md", changed.path)
        } finally {
            store.uninstall(id)
            repository.deleteLocalSpace()
        }
    }
}
