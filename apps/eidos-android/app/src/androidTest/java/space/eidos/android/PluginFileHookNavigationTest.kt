package space.eidos.android

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class PluginFileHookNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun hookRenamePreservesEditorAndFollowsSubsequentFileActions() = runBlocking {
        val app = compose.activity.application
        val space = SpaceCatalog(app).create("Hook editor ${UUID.randomUUID()}").id
        val repository = SpaceRepository(app, space)
        val store = PluginMarketStore(app)
        val id = "test.hook-navigation"
        val manifest = JSONObject().put("apiVersion", 1).put("id", id).put("name", "Hooks")
            .put("version", "1.0.0").put("requires", JSONObject().put("pluginApi", "3.3.0"))
            .put("extension", "./main.js").put("hooks", JSONArray(listOf(
                JSONObject().put("id", "save").put("title", "Saved").put("event", "document.saved")
                    .put("extensions", JSONArray(listOf(".md"))).put("access", "write"),
            )))
        val code = """export default ctx => ctx.capabilities.hooks.register('save', ({event}) => {
          const title = /^# (.+)/.exec(event.document.text)?.[1];
          return title && title !== /^# (.+)/.exec(event.previousText ?? '')?.[1] ? {name:title+'.md'} : undefined;
        });"""
        val json = JSONObject().put("format", 2).put("manifest", manifest)
            .put("modules", JSONObject().put("./main.js", code)).toString()
        lateinit var model: EidosModel
        var initialized = false
        try {
            val path = repository.create("", "Old", "markdown")
            repository.saveText(repository.readText(path).copy(text = "# Old\nBody"))
            store.install(PreparedPlugin(json, manifest, PluginMarketTransport.hash(json.toByteArray())), space)
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                initialized = true
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15_000) { !model.state.value.busy }
            val file = repository.file(path)
            compose.runOnUiThread { model.open(file) }
            waitJs("document.querySelector('.eme-content-editable h1')?.textContent === 'Old'")
            val editor = web()
            val generation = model.state.value.editorGeneration
            js("""(() => {
              window.hookEditorIdentity = 'preserved';
              const root = document.querySelector('.eme-content-editable');
              root.focus(); const range = document.createRange();
              range.selectNodeContents(root.querySelector('h1'));
              getSelection().removeAllRanges(); getSelection().addRange(range);
              document.execCommand('insertText', false, 'New');
            })()""")
            waitJs("document.querySelector('.eme-content-editable h1')?.textContent === 'New'")
            js("window.eidosFlush().then(() => window.hookFlushed = true)")
            waitJs("window.hookFlushed === true")
            compose.waitUntil(15_000) { model.state.value.webFile?.path == "New.md" }
            assertSame(editor, web())
            assertEquals(generation, model.state.value.editorGeneration)
            assertEquals("\"preserved\"", js("window.hookEditorIdentity"))
            val saved = repository.readText("New.md").text
            assertTrue(saved.startsWith("# New\n"))
            assertTrue(saved.contains("Body"))

            val renamed = repository.file("New.md")
            compose.runOnUiThread { model.rename(renamed, "Final.md") {} }
            compose.waitUntil(15_000) {
                !model.state.value.busy && model.state.value.webFile?.path == "Final.md"
            }
            assertEquals(generation + 1, model.state.value.editorGeneration)
            waitJs("typeof window.eidosFlush === 'function' && !!document.querySelector('.eme-content-editable h1')")
            val final = repository.file("Final.md")
            compose.runOnUiThread { model.trash(final) }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.webFile == null }
            assertNull(model.state.value.error)
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                if (initialized) model.viewModelScope.cancel()
            }
            store.uninstall(id)
            repository.deleteLocalSpace()
        }
    }

    private fun web(): WebView {
        fun find(view: View): WebView? {
            if (view is WebView) return view
            if (view is ViewGroup) for (i in 0 until view.childCount) find(view.getChildAt(i))?.let { return it }
            return null
        }
        var result: WebView? = null
        compose.runOnUiThread { result = find(compose.activity.window.decorView) }
        return checkNotNull(result)
    }

    private fun js(script: String): String {
        val latch = CountDownLatch(1)
        var result = ""
        val editor = web()
        compose.runOnUiThread { editor.evaluateJavascript(script) { result = it; latch.countDown() } }
        check(latch.await(10, TimeUnit.SECONDS)) { "Editor JavaScript timed out" }
        return result
    }

    private fun waitJs(condition: String) {
        compose.waitUntil(15_000) { runCatching { js(condition) == "true" }.getOrDefault(false) }
    }
}
