package space.eidos.android

import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class MobilePluginUiTest {
    @Test
    fun navigationPageIsScopedToSpaceAndSurvivesTabSwitches() {
        val directory = InstrumentationRegistry.getArguments().getString("pluginFixtures")
        assumeTrue(directory != null)
        val app = compose.activity.application
        val id = "navigation-${UUID.randomUUID()}"
        val pluginId = "test.navigation"
        val repository = SpaceRepository(app, id)
        val store = PluginMarketStore(app)
        assumeTrue(store.installed(id).none { it.id == pluginId })
        val catalog =
            JSONObject(File(directory!!, "registry.json").readText()).getJSONArray("plugins")
        val entry =
            (0 until catalog.length()).map(catalog::getJSONObject).single {
                it.getString("id") == "eidos.journals"
            }
        val original = runBlocking {
            store.prepare(Uri.fromFile(File(directory, entry.getString("asset"))))
        }
        val payload = JSONObject(original.json)
        val manifest = payload.getJSONObject("manifest").put("id", pluginId)
        manifest
            .getJSONArray("placements")
            .put(JSONObject().put("location", "navigation").put("view", "overview"))
        val json = payload.toString()
        lateinit var model: EidosModel
        fun find(view: View): WebView? =
            when (view) {
                is WebView -> view
                is ViewGroup ->
                    (0 until view.childCount).firstNotNullOfOrNull { find(view.getChildAt(it)) }
                else -> null
            }
        try {
            runBlocking {
                store.install(
                    PreparedPlugin(json, manifest, PluginMarketTransport.hash(json.toByteArray()))
                )
            }
            assertTrue(store.navigationPages(id).isEmpty())
            store.setEnabled(id, store.installed(id).single { it.id == pluginId }, true)
            assertTrue(store.navigationPages("another-space").isEmpty())
            assertTrue(store.navigationPages(id).single().viewId == "overview")
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.onNodeWithText("Journals").performClick()
            compose.waitForIdle()
            var originalWeb: WebView? = null
            compose.runOnUiThread { originalWeb = find(compose.activity.window.decorView) }
            assertTrue(originalWeb != null)
            compose.onNodeWithContentDescription("资料").performClick()
            compose.onNodeWithText("Journals").performClick()
            compose.runOnUiThread {
                assertTrue(originalWeb === find(compose.activity.window.decorView))
            }
            store.setEnabled(id, store.installed(id).single { it.id == pluginId }, false)
            compose.waitUntil(15000) { model.state.value.pluginGeneration > 0 }
            compose.waitForIdle()
            compose.runOnUiThread { assertTrue(find(compose.activity.window.decorView) == null) }
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            store.uninstall(pluginId)
            runBlocking { repository.close() }
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun installedMarkmapOpenWithBindsCurrentNoteAndStartsWithoutAnotherPicker() {
        val fixtures = InstrumentationRegistry.getArguments().getString("pluginFixtures")
        assumeTrue("Requires published plugin fixtures", fixtures != null)
        val directory = File(fixtures!!)
        val entries =
            JSONObject(File(directory, "registry.json").readText()).getJSONArray("plugins")
        val entry =
            (0 until entries.length()).map(entries::getJSONObject).single {
                it.getString("id") == "eidos.markmap"
            }
        val app = compose.activity.application
        val id = "plugin-opener-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val store = PluginMarketStore(app)
        val prepared = runBlocking {
            store.prepare(Uri.fromFile(File(directory, entry.getString("asset"))))
        }
        val existing = store.installed(id).find { it.id == "eidos.markmap" }
        assumeTrue(
            "Preserve a different installed Markmap version",
            existing == null || existing.revision == prepared.revision,
        )
        lateinit var model: EidosModel
        fun find(view: View): WebView? =
            when (view) {
                is WebView -> view
                is ViewGroup ->
                    (0 until view.childCount).firstNotNullOfOrNull { find(view.getChildAt(it)) }
                else -> null
            }
        try {
            if (existing == null) runBlocking { store.install(prepared) }
            store.setEnabled(id, store.installed(id).single { it.id == "eidos.markmap" }, true)
            val note = runBlocking {
                repository.pluginWriteText("Note.md", "# Mobile Open With\n\n- Current document\n")
                repository.file("Note.md")
            }
            compose.runOnUiThread { model = EidosModel(app, repository) }
            compose.waitUntil(15000) {
                !model.state.value.busy && model.state.value.files.isNotEmpty()
            }
            compose.runOnUiThread {
                compose.activity.setContent { EidosApp(model) }
                model.openWithPlugin(note, "eidos.markmap/markmap")
            }
            compose.waitUntil(15000) { model.state.value.pluginFile != null }
            compose.waitForIdle()
            var ready = false
            var diagnostic = ""
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30)
            while (!ready && System.nanoTime() < deadline) {
                val done = CountDownLatch(1)
                compose.runOnUiThread {
                    val web = find(compose.activity.window.decorView)
                    if (web == null) done.countDown()
                    else
                        web.evaluateJavascript(
                            "!!document.querySelector('#app.file-view iframe') && document.querySelector('[role=status]')?.textContent === '' && !document.querySelector('select') && document.querySelector('iframe').getBoundingClientRect().height > innerHeight * 0.8"
                        ) {
                            diagnostic = it
                            ready = it == "true"
                            done.countDown()
                        }
                }
                assertTrue(done.await(5, TimeUnit.SECONDS))
                if (!ready) Thread.sleep(100)
            }
            assertTrue("Open with did not bind and start Markmap: $diagnostic", ready)
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            if (existing == null) store.uninstall("eidos.markmap")
            else store.setEnabled(id, existing, false)
            runBlocking { repository.close() }
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun managerStartsWithNativeControlsOffline() {
        val app = compose.activity.application
        val id = "plugin-ui-${UUID.randomUUID()}"
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, SpaceRepository(app, id))
                compose.activity.setContent {
                    MaterialTheme { NativePluginManager(model, "Test Space") {} }
                }
            }
            compose.onNodeWithText("已安装").assertExists()
            compose.onNodeWithText("发现").assertExists()
            compose.onNodeWithContentDescription("插件更多操作").performClick()
            compose.onNodeWithText("导入插件包").assertExists()
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            runBlocking { model.repository.close() }
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
