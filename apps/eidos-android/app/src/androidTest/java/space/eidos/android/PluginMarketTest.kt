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
