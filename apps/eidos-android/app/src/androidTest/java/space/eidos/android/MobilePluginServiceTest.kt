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
                val prepared = store.prepare(Uri.fromFile(archive))
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
