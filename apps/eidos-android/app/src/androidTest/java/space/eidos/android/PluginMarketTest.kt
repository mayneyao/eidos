package space.eidos.android

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import java.util.zip.GZIPOutputStream
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PluginMarketTest {
    @Test
    fun localizedPackageCanBeReviewedInstalledAndLoaded() = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "localized-plugin-${UUID.randomUUID()}"
        val store = PluginMarketStore(app, name)
        val input = File(app.cacheDir, "$name.eidos-plugin")
        val raw = """{"format":3,"manifest":{"apiVersion":1,"id":"test.localized","name":"%name%","version":"1.0.0","requires":{"pluginApi":"3.7.0"},"views":[{"id":"main","title":"%name%","kind":"page","entry":"./main.js"}],"placements":[{"location":"navigation","view":"main"}],"i18n":{"defaultLocale":"en","messages":{"en":"./en.json","zh-CN":"./zh.json"}}},"modules":{"./main.js":"export default function mount(ctx) { ctx.root.textContent = ctx.i18n.t('name'); }"},"resources":{"./en.json":"{\"name\":\"Example\"}","./zh.json":"{\"name\":\"示例\"}"}}"""
        try {
            GZIPOutputStream(input.outputStream()).use { it.write(raw.toByteArray()) }
            val prepared = store.prepare(Uri.fromFile(input))
            assertFalse(prepared.manifest.getString("name").startsWith("%"))
            assertTrue(store.installed("a").isEmpty())
            store.install(prepared, "a")
            assertTrue(store.installed("a").single().enabled)
            assertFalse(store.installed("b").single().enabled)
            assertEquals(1, store.navigationPages("a").size)
            assertEquals(3, store.program("a", "test.localized").getInt("format"))
            assertTrue(store.program("a", "test.localized").getJSONObject("resources").has("./zh.json"))
        } finally {
            store.uninstall("test.localized")
            input.delete()
            File(app.filesDir, "$name-packages").deleteRecursively()
            app.deleteSharedPreferences(name)
        }
    }

    @Test
    fun installReviewEnableUpdateAndUninstallRemainScoped() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "plugin-test-${UUID.randomUUID()}"
        val store = PluginMarketStore(context, name)
        val input = File(context.cacheDir, "$name.eidos-plugin")
        fun archive(version: String, code: String): ByteArray {
            val manifest =
                JSONObject()
                    .put("apiVersion", 1)
                    .put("id", "test.android-market")
                    .put("name", "Test")
                    .put("version", version)
                    .put("requires", JSONObject().put("pluginApi", "3.0.0"))
                    .put(
                        "views",
                        JSONArray()
                            .put(
                                JSONObject()
                                    .put("id", "main")
                                    .put("title", "Test")
                                    .put("kind", "file")
                                    .put("access", "read")
                                    .put("entry", "./main.js")
                            ),
                    )
                    .put(
                        "placements",
                        JSONArray()
                            .put(
                                JSONObject()
                                    .put("location", "file/open")
                                    .put("view", "main")
                                    .put("extensions", JSONArray().put(".gpx"))
                            ),
                    )
            val raw =
                JSONObject()
                    .put("format", 2)
                    .put("manifest", manifest)
                    .put("modules", JSONObject().put("./main.js", code))
                    .toString()
            val output = ByteArrayOutputStream()
            GZIPOutputStream(output).use { it.write(raw.toByteArray()) }
            return output.toByteArray()
        }
        try {
            input.writeBytes(archive("1.0.0", "export default function mount() {}"))
            val prepared = store.prepare(Uri.fromFile(input))
            assertTrue(store.installed("a").isEmpty()) // Review is not installation.
            val blockedDirectory = File(context.filesDir, "$name-packages")
            blockedDirectory.writeText("block package persistence")
            assertTrue(runCatching { store.install(prepared, "a") }.isFailure)
            assertTrue(store.installed("a").isEmpty())
            blockedDirectory.delete()
            store.install(prepared, "a")
            assertTrue(store.installed("a").single().enabled)
            assertFalse(store.installed("b").single().enabled)
            store.setEnabled("b", store.installed("b").single(), true)
            store.install(prepared, "a") // Reinstalling identical bytes preserves other grants.
            assertTrue(store.installed("b").single().enabled)
            val file = SpaceFile("ride.gpx", "ride.gpx", false, 0, 0)
            val view = store.registry("a").resolve(file, "test.android-market/main")
            assertEquals("export default function mount() {}", store.source("a", view))
            input.writeBytes(
                archive("1.1.0", "export default function mount() { return undefined; }")
            )
            store.install(store.prepare(Uri.fromFile(input)), "a")
            assertTrue(store.installed("a").single().enabled)
            assertFalse(store.installed("b").single().enabled)
            assertFalse(store.authorized("a", view))
            input.writeBytes(
                archive("1.2.0", "export default () => import('https://example.com/a.js')")
            )
            try {
                store.prepare(Uri.fromFile(input))
                fail("Dynamic import should be rejected")
            } catch (_: IllegalStateException) {}
            assertEquals("1.1.0", store.installed("a").single().manifest.getString("version"))
            assertTrue(store.installed("a").single().enabled)
            store.uninstall("test.android-market")
            assertTrue(store.installed("a").isEmpty())
        } finally {
            input.delete()
            File(context.filesDir, "$name-packages").deleteRecursively()
            context.deleteSharedPreferences(name)
        }
    }
}
