package space.eidos.android

import android.net.Uri
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

class MobilePluginServiceTest {
    @Test
    fun canvasCanBeInstalledForItsSpaceAndDocumentSaveChecksTheDiskVersion() = runBlocking {
        val argument = InstrumentationRegistry.getArguments().getString("pluginFixtures")
        assumeTrue("Provide the published Canvas 0.5.7 archive", argument != null)
        val archive = File(argument!!, "eidos.canvas-0.5.7.eidos-plugin")
        assumeTrue(archive.isFile)
        assertEquals("18eccc992758156c3be6a1efb85d2c1b6e1556087432e13871a3320a149462c2", PluginMarketTransport.hash(archive.readBytes()))
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val space = "canvas-" + UUID.randomUUID()
        val repository = SpaceRepository(app, space)
        val store = PluginMarketStore(app, space)
        val service = MobilePluginService(app, repository, store, {}, { error("No picker") })
        val file = "Canvas.canvas"
        fun request(text: String, digest: String) = JSONObject()
            .put("path", file).put("text", text).put("expectedDigest", digest)
        try {
            val prepared = store.prepare(Uri.fromFile(archive))
            assertEquals("eidos.canvas", prepared.manifest.getString("id"))
            store.install(prepared, space)
            assertTrue(store.registry(space).allViews().any { it.id == "eidos.canvas/viewer" && it.document })
            assertFalse(store.registry("other").allViews().any { it.id == "eidos.canvas/viewer" })

            val original = "\uFEFF{\"nodes\":[],\"edges\":[]}"
            val edited = "\uFEFF{\"nodes\":[{\"id\":\"test\"}],\"edges\":[]}"
            repository.pluginWriteText(file, original)
            val snapshot = repository.pluginTextSnapshot(file)
            val save = service.handle("saveDocument", request(edited, snapshot.digest)) as JSONObject
            assertEquals("saved", save.getString("status"))
            assertEquals(edited, repository.pluginTextSnapshot(file).text)
            val conflict = service.handle("saveDocument", request(original, snapshot.digest)) as JSONObject
            assertEquals("conflict", conflict.getString("status"))
            assertEquals(edited, repository.pluginTextSnapshot(file).text)
        } finally {
            store.uninstall("eidos.canvas")
            app.getSharedPreferences(space, 0).edit().clear().commit()
            repository.close()
            File(app.filesDir, "spaces/$space").deleteRecursively()
            File(app.filesDir, "$space-packages").deleteRecursively()
        }
    }

    @Test
    fun workspaceFilesStayLocalAndEidosBytesCannotBeOverwritten() = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "plugins-" + UUID.randomUUID()
        val repository = SpaceRepository(app, id)
        val store = PluginMarketStore(app, id)
        val service = MobilePluginService(app, repository, store, {}, { error("No picker") })
        try {
            service.handle(
                "writeText",
                JSONObject().put("path", "journals/2026/note.md").put("text", "local"),
            )
            assertEquals(
                "local",
                (service.handle("readText", JSONObject().put("path", "journals/2026/note.md"))
                        as JSONObject)
                    .getString("text"),
            )
            for (path in listOf("../outside.md", ".graft/config", "database.eidos")) {
                assertTrue(
                    runCatching {
                            service.handle(
                                "writeText",
                                JSONObject().put("path", path).put("text", "bad"),
                            )
                        }
                        .isFailure
                )
            }
            assertEquals(
                0,
                (service.handle("files", JSONObject().put("path", "missing").put("recursive", true))
                        as org.json.JSONArray)
                    .length(),
            )
        } finally {
            repository.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun publishedPackagesValidateInstallAndRemainDisabledUntilGranted() = runBlocking {
        val fixtureDirectory = InstrumentationRegistry.getArguments().getString("pluginFixtures")
        assumeTrue(
            "Pass pluginFixtures pointing to SHA-256 verified registry archives",
            fixtureDirectory != null,
        )
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "published-plugins-" + UUID.randomUUID()
        val store = PluginMarketStore(app, name)
        val directory = File(fixtureDirectory!!)
        val entries =
            JSONObject(File(directory, "registry.json").readText()).getJSONArray("plugins")
        try {
            for (index in 0 until entries.length()) {
                val entry = entries.getJSONObject(index)
                val archive = File(directory, entry.getString("asset"))
                assertEquals(
                    entry.getString("sha256"),
                    PluginMarketTransport.hash(archive.readBytes()),
                )
                val prepared = if (InstrumentationRegistry.getArguments().getString("pluginMarketLive") == "true") {
                    store.prepare(MarketPlugin(entry.getString("id"), entry.getString("name"), entry.getString("description"), entry.getString("version"),
                        "https://github.com/${entry.getString("repo")}/releases/download/${entry.getString("tag")}/${entry.getString("asset")}", entry.getString("sha256")))
                } else store.prepare(Uri.fromFile(archive))
                assertEquals(entry.getString("id"), prepared.manifest.getString("id"))
                store.install(prepared)
                val plugin = store.installed("a").single { it.id == entry.getString("id") }
                assertFalse(plugin.enabled)
                store.setEnabled("a", plugin, true)
                assertFalse(store.installed("b").single { it.id == plugin.id }.enabled)
                assertEquals(
                    plugin.id,
                    store.program("a", plugin.id).getJSONObject("manifest").getString("id"),
                )
            }
            // Non-file contributions must not break the existing native "open with" menu.
            assertTrue(store.registry("a").allViews().any { it.id == "eidos.markmap/markmap" })
        } finally {
            store.installed("a").forEach { store.uninstall(it.id) }
            app.getSharedPreferences(name, 0).edit().clear().commit()
            File(app.filesDir, "$name-packages").deleteRecursively()
        }
    }
}
