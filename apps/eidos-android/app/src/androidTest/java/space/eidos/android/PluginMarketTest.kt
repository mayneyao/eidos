package space.eidos.android

import android.content.Context
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
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

internal fun fixtureMarketStore(context: Context, name: String, directory: File) =
    PluginMarketStore(context, name) { url, limit ->
        val file = if (url == PluginMarketTransport.registryUrl) "registry.json" else url.substringAfterLast('/')
        require(file.isNotBlank() && File(file).name == file)
        File(directory, file).inputStream().use { PluginMarketTransport.bounded(it, limit) }
    }

@RunWith(AndroidJUnit4::class)
class PluginMarketTest {
    @Test
    fun marketOnlyOffersReleasesAcceptedByInstaller() = runBlocking {
        val arguments = InstrumentationRegistry.getArguments()
        val fixtureDirectory = arguments.getString("marketFixtures")?.let(::File)
        assumeTrue(fixtureDirectory != null || arguments.getString("marketLive") == "true")
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "market-compatibility-${UUID.randomUUID()}"
        val store = if (fixtureDirectory == null) PluginMarketStore(app, name)
            else fixtureMarketStore(app, name, fixtureDirectory)
        try {
            val catalog = store.market()
            assertFalse(catalog.incomplete)
            val ids = catalog.plugins.map { it.id }
            assertTrue(ids.containsAll(listOf("eidos.canvas", "eidos.journals")))
            assertFalse(ids.any { it in listOf("eidos.recent-history", "eidos.forest-theme", "eidos.maple-theme", "eidos.dashboard") })
            assertTrue(store.installed("test").isEmpty())
            for (entry in catalog.plugins) {
                val review = store.prepare(entry)
                assertEquals(entry.id, review.manifest.getString("id"))
                assertEquals(entry.version, review.manifest.getString("version"))
            }
            assertEquals(ids, store.market().plugins.map { it.id })
        } finally {
            app.deleteSharedPreferences(name)
        }
    }

    @Test
    fun seededReleasesOpenWithoutArchiveRequestsAndUnknownUpdateRetries() = runBlocking {
        val fixtures = InstrumentationRegistry.getArguments().getString("marketFixtures")
        assumeTrue(fixtures != null)
        val directory = File(fixtures!!)
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "market-refresh-${UUID.randomUUID()}"
        val catalog = JSONObject(File(directory, "registry.json").readText())
        val entries = catalog.getJSONArray("plugins")
        val canvas = (0 until entries.length()).map(entries::getJSONObject).single { it.getString("id") == "eidos.canvas" }
        val original = JSONObject(canvas.toString())
        val raw = JSONObject(PluginMarketTransport.unpack(File(directory, original.getString("asset")).readBytes()))
        raw.getJSONObject("manifest").put("version", "0.5.8")
        val update = ByteArrayOutputStream().also { stream ->
            GZIPOutputStream(stream).use { it.write(raw.toString().toByteArray()) }
        }.toByteArray()
        val requests = java.util.Collections.synchronizedList(mutableListOf<String>())
        var allowUpdate = false
        val store = PluginMarketStore(app, name) { url, limit ->
            if (url == PluginMarketTransport.registryUrl) catalog.toString().toByteArray()
            else {
                val asset = url.substringAfterLast('/')
                requests.add(asset)
                if (asset == "eidos.canvas-0.5.8.eidos-plugin") {
                    check(allowUpdate) { "Temporary download error" }
                    update
                } else File(directory, asset).inputStream().use { PluginMarketTransport.bounded(it, limit) }
            }
        }
        try {
            val first = store.market()
            assertTrue(requests.isEmpty())
            assertFalse(first.incomplete)
            val shown = first.plugins.single { it.id == "eidos.canvas" }
            canvas.put("version", "0.5.8").put("asset", "eidos.canvas-0.5.8.eidos-plugin")
                .put("tag", "v0.5.8").put("sha256", PluginMarketTransport.hash(update))
            val failed = store.market()
            assertTrue(failed.incomplete)
            assertFalse(failed.plugins.any { it.id == "eidos.canvas" })
            assertEquals("0.5.7", store.prepare(shown).manifest.getString("version"))
            allowUpdate = true
            val retried = store.market()
            assertFalse(retried.incomplete)
            val newRelease = retried.plugins.single { it.id == "eidos.canvas" }
            assertEquals("0.5.8", store.prepare(newRelease).manifest.getString("version"))
            assertEquals(listOf("eidos.canvas-0.5.8.eidos-plugin", "eidos.canvas-0.5.7.eidos-plugin", "eidos.canvas-0.5.8.eidos-plugin"), requests)
        } finally {
            app.deleteSharedPreferences(name)
        }
    }

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
            val file = SpaceFile("ride.GPX", "ride.GPX", false, 0, 0)
            assertEquals(listOf(".gpx"), store.installDefaultExtensions(prepared))
            val blockedDirectory = File(context.filesDir, "$name-packages")
            blockedDirectory.writeText("block package persistence")
            assertTrue(runCatching { store.install(prepared, "a", makeDefault = true) }.isFailure)
            assertTrue(store.installed("a").isEmpty())
            assertNull(store.registry("a").configuredExtension(file))
            blockedDirectory.delete()
            store.install(prepared, "a")
            assertNull(store.registry("a").defaultFor(file))
            assertTrue(store.installDefaultExtensions(prepared).isEmpty())
            assertTrue(store.installed("a").single().enabled)
            assertFalse(store.installed("b").single().enabled)
            store.setEnabled("b", store.installed("b").single(), true)
            store.install(prepared, "a", makeDefault = true) // Reinstall preserves preferences and grants.
            assertNull(store.registry("a").configuredExtension(file))
            assertTrue(store.installed("b").single().enabled)
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

    @Test
    fun checkedInstallUsesOnlyUnambiguousExtensionsInTheTargetSpace() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "plugin-default-test-${UUID.randomUUID()}"
        val store = PluginMarketStore(context, name)
        val input = File(context.cacheDir, "$name.eidos-plugin")
        suspend fun prepare(
            id: String,
            version: String,
            vararg handlers: Pair<String, List<String>>,
        ): PreparedPlugin {
            val views = JSONArray()
            val placements = JSONArray()
            handlers.map { it.first }.distinct().forEach { view ->
                views.put(JSONObject().put("id", view).put("title", view).put("kind", "file")
                    .put("access", "read").put("entry", "./main.js"))
            }
            handlers.forEach { (view, extensions) ->
                placements.put(JSONObject().put("location", "file/open").put("view", view)
                    .put("extensions", JSONArray(extensions)))
            }
            val manifest = JSONObject().put("apiVersion", 1).put("id", id).put("name", id)
                .put("version", version).put("requires", JSONObject().put("pluginApi", "3.0.0"))
                .put("views", views).put("placements", placements)
            val payload = JSONObject().put("format", 2).put("manifest", manifest)
                .put("modules", JSONObject().put("./main.js", "export default function mount() {}"))
            GZIPOutputStream(input.outputStream()).use { it.write(payload.toString().toByteArray()) }
            return store.prepare(Uri.fromFile(input))
        }
        fun file(name: String) = SpaceFile(name, name, false, 0, 0)
        val canvas = file("Sketch.CANVAS")
        val gpx = file("Trail.gpx")
        val fit = file("Trail.fit")
        val eidos = file("Contacts.eidos")
        try {
            val first = prepare(
                "test.first", "1.0.0",
                "main" to listOf(".canvas", ".fit"),
            )
            store.install(first, "a", makeDefault = true)
            assertEquals("test.first/main", store.registry("a").defaultFor(canvas)?.id)
            assertEquals("test.first/main", store.registry("a").defaultFor(fit)?.id)
            store.setEnabled("b", store.installed("b").single(), true)
            assertNull(store.registry("b").defaultFor(canvas))

            val second = prepare(
                "test.second", "1.0.0",
                "main" to listOf(".canvas"),
                "main" to listOf(".gpx"),
                "alternate" to listOf(".gpx", ".fit"),
                "extra" to listOf(".fit"),
                "database" to listOf(".eidos"),
            )
            assertEquals(listOf(".canvas"), store.installDefaultExtensions(second))
            store.install(second, "a", makeDefault = true)
            assertEquals("test.second/main", PluginMarketStore(context, name).registry("a").defaultFor(canvas)?.id)
            assertEquals("test.first/main", store.registry("a").defaultFor(fit)?.id)
            assertNull(store.registry("a").configuredExtension(gpx))
            assertNull(store.registry("a").configuredExtension(eidos))
            assertEquals(setOf("test.second/main", "test.second/alternate"), store.registry("a")
                .candidates(gpx).map { it.id }.filter { it.startsWith("test.second/") }.toSet())
            assertEquals("test.second/database", store.registry("a").resolve(eidos, "test.second/database").id)

            val installed = store.installed("a").single { it.id == "test.second" }
            store.setEnabled("a", installed, false)
            assertNull(store.registry("a").defaultFor(canvas))
            assertEquals(".canvas", store.registry("a").configuredExtension(canvas))
            store.setEnabled("a", installed, true)
            assertEquals("test.second/main", store.registry("a").defaultFor(canvas)?.id)

            val update = prepare("test.second", "1.1.0", "new-view" to listOf(".canvas"))
            assertTrue(store.installDefaultExtensions(update).isEmpty())
            store.install(update, "a")
            assertNull(store.registry("a").defaultFor(canvas))
            assertEquals(".canvas", store.registry("a").configuredExtension(canvas))
            store.clearFileDefault("a", canvas)
            assertNull(store.registry("a").configuredExtension(canvas))
            assertEquals("test.first/main", store.registry("a").defaultFor(fit)?.id)

            store.uninstall("test.first")
            assertNull(store.registry("a").defaultFor(fit))
            assertNull(store.registry("a").configuredExtension(fit))
            store.install(first, "a")
            assertNull(store.registry("a").defaultFor(fit))
        } finally {
            input.delete()
            File(context.filesDir, "$name-packages").deleteRecursively()
            context.deleteSharedPreferences(name)
        }
    }
}
