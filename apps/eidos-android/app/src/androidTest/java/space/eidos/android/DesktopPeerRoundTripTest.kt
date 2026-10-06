package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Opt-in integration test against the real development Desktop's isolated Space copy.
 * The host verifies received files, introduces a concurrent edit, and resolves it in
 * the Desktop UI before supplying the corresponding continuation marker.
 */
class DesktopPeerRoundTripTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun showsPersistedWarningAfterReopeningSync() = runBlocking<Unit> {
        val app = compose.activity.application
        val fixture = File(app.cacheDir, "desktop-peer-fixture.json")
        assumeTrue("Provide the explicit full-Space verification fixture", fixture.exists())
        val options = JSONObject(fixture.readText())
        val local = SpaceCatalog(app).peerLocalSpaces().single {
            it.fingerprint == options.getString("fingerprint") && it.remoteId == options.getString("space")
        }
        assertEquals(listOf("files.eidos"), local.unsupportedFiles)
        lateinit var model: EidosModel
        compose.runOnUiThread {
            model = EidosModel(app, SpaceRepository(app, local.id))
            model.peerSelectedDevice = local.fingerprint
            compose.activity.setContent {
                val state = model.state.collectAsState()
                MaterialTheme(colorScheme = eidosColorScheme()) { SyncScreen(state.value, model) }
            }
        }
        try {
            compose.waitUntil(30_000) { model.state.value.peerLocalSpaces.any { it.id == local.id } }
            compose.waitUntil(30_000) { !model.state.value.busy }
            compose.runOnUiThread { model.refreshPeerAvailability() }
            compose.waitUntil(90_000) { model.state.value.peerAvailability[local.fingerprint]?.canSync(local.remoteId) == true }
            compose.onNodeWithText(local.name).assertIsDisplayed()
            compose.onNodeWithText("files.eidos 已保留", substring = true).assertIsDisplayed()
            compose.onAllNodesWithText("同步").filterToOne(hasClickAction()).assertIsEnabled()
            compose.onRoot().captureToImage().asAndroidBitmap().let { bitmap ->
                File(app.cacheDir, "desktop-roundtrip-persistent-warning.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            }
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            model.repository.close()
        }
    }

    @Test fun verifyDownloadedFilesAndCompatibilityWarning() = runBlocking {
        val app = compose.activity.application
        val fixture = File(app.cacheDir, "desktop-peer-fixture.json")
        val manifestFile = File(app.cacheDir, "desktop-peer-manifest.json")
        assumeTrue("Provide the explicit full-Space verification fixture", fixture.exists() && manifestFile.exists())
        val options = JSONObject(fixture.readText())
        val local = SpaceCatalog(app).peerLocalSpaces().single {
            it.fingerprint == options.getString("fingerprint") && it.remoteId == options.getString("space")
        }
        val root = File(app.filesDir, "spaces/${local.id}")
        val manifest = JSONArray(manifestFile.readText())
        var bytes = 0L
        for (index in 0 until manifest.length()) {
            val entry = manifest.getJSONObject(index)
            val file = File(root, entry.getString("path"))
            assertEquals(entry.getString("path"), entry.getLong("bytes"), file.length())
            val hash = MessageDigest.getInstance("SHA-256")
            var offset = 0L
            file.inputStream().use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val size = input.read(buffer)
                    if (size < 0) break
                    if (file.extension == "eidos") for (start in listOf(24, 92, 96)) for (position in start until start + 4)
                        if (position >= offset && position < offset + size) buffer[(position - offset).toInt()] = 0
                    hash.update(buffer, 0, size)
                    offset += size
                }
            }
            assertEquals(entry.getString("path"), entry.getString("contentSha256"), hash.digest().joinToString("") { "%02x".format(it) })
            bytes += file.length()
        }
        val repository = SpaceRepository(app, local.id)
        try { repository.finalizePeerDownload() }
        finally { repository.close() }
        assertTrue(SpaceCatalog(app).peerLocalSpaces().single { it.id == local.id }.unsupportedFiles.isEmpty())
        File(app.cacheDir, "desktop-roundtrip-verification.json").writeText(JSONObject()
            .put("files", manifest.length()).put("bytes", bytes).put("normalizedHashesMatch", true).put("contentValidationSkipped", true).toString())
    }

    @Test fun fullSpaceDownloadEditsAndConflictReview() = runBlocking {
        val app = compose.activity.application
        val fixture = File(app.cacheDir, "desktop-peer-fixture.json")
        assumeTrue("Provide the explicit Desktop test invitation", fixture.exists())
        val options = JSONObject(fixture.readText())
        val invitation = PeerInvitation.parse(options.getString("invitation"))
        assertEquals(options.getString("fingerprint"), invitation.fingerprint)
        val stateFile = File(app.cacheDir, "desktop-roundtrip-state.json")
        val run = UUID.randomUUID().toString()
        val launchId = "desktop-test-$run"
        lateinit var model: EidosModel
        var modelReady = false
        fun record(phase: String) {
            stateFile.writeText(JSONObject().put("phase", phase).put("run", run)
                .put("spaceId", model.state.value.spaceId)
                .put("error", model.state.value.peerProgress?.error).toString())
        }
        suspend fun awaitHost(phase: String) {
            record(phase)
            val marker = File(app.cacheDir, "desktop-roundtrip-$phase")
            val deadline = android.os.SystemClock.elapsedRealtime() + 600_000
            while (android.os.SystemClock.elapsedRealtime() < deadline) {
                if (marker.exists() && marker.readText().trim() == run) return
                delay(250)
            }
            error("Desktop did not complete $phase")
        }
        fun awaitSync(expectConflict: Boolean = false) {
            var stage = ""
            compose.waitUntil(900_000) {
                val progress = model.state.value.peerProgress
                if (progress?.stage != stage) {
                    stage = progress?.stage.orEmpty()
                    android.util.Log.i("DesktopRoundTrip", stage)
                }
                progress?.finishedAt != null
            }
            val progress = model.state.value.peerProgress!!
            if (expectConflict) assertTrue(progress.error.orEmpty(), progress.error.orEmpty().contains("电脑"))
            else assertNull(progress.error, progress.error)
        }
        fun sync(expectConflict: Boolean = false) {
            compose.runOnUiThread { model.syncPeerSpace(model.state.value.spaceId) }
            compose.waitUntil(10_000) { model.state.value.peerBusy }
            awaitSync(expectConflict)
        }
        try {
            compose.runOnUiThread {
                model = EidosModel(app, SpaceRepository(app, launchId))
                modelReady = true
                model.peerSelectedDevice = invitation.fingerprint
                compose.activity.setContent {
                    val state = model.state.collectAsState()
                    MaterialTheme(colorScheme = eidosColorScheme()) { SyncScreen(state.value, model) }
                }
                model.pairPeer(options.getString("invitation"))
            }
            record("pairing")
            compose.waitUntil(300_000) { !model.state.value.peerBusy && model.state.value.peerSpaces.any { it.fingerprint == invitation.fingerprint } }
            compose.runOnUiThread { model.refreshPeerAvailability() }
            compose.waitUntil(60_000) { model.state.value.peerAvailability[invitation.fingerprint]?.reachable == true }
            val existing = SpaceCatalog(app).peerLocalSpaces().firstOrNull { it.fingerprint == invitation.fingerprint && it.remoteId == options.getString("space") }
            if (existing == null) compose.onNodeWithText("下载").performClick()
            else compose.runOnUiThread { model.syncPeerSpace(existing.id) }
            awaitSync()
            record("downloaded")
            val root = File(app.filesDir, "spaces/${model.state.value.spaceId}")
            assertTrue(File(root, "showcase/performance/perf-test.eidos").length() > 500_000_000)
            assertTrue(File(root, "files.eidos").isFile)
            compose.onRoot().captureToImage().asAndroidBitmap().let { bitmap ->
                File(app.cacheDir, "desktop-roundtrip-download.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            }
            val note = File(root, "android-sync-verification.md")
            note.writeText("from Android\n")
            val database = File(root, "android-sync-verification.eidos")
            if (!database.exists()) NativeRuntime.call(database.path, "create", JSONObject().put("title", "Android sync verification"))
            val schema = NativeRuntime.call(database.path, "schema")
            val snapshot = schema.getJSONObject("snapshot")
            val objects = schema.getJSONArray("objects")
            val table = (0 until objects.length()).map { objects.getJSONObject(it) }.first { it.optString("object") == "table" }
            val label = table.getString("labelFieldId")
            NativeRuntime.call(database.path, "mutateRows", JSONObject().put("tableId", table.getString("id")).put("expectedRevision", snapshot.get("revision"))
                .put("changes", JSONArray().put(JSONObject().put("kind", "create").put("clientKey", run).put("values", JSONObject().put(label, "edited on Android")))))
            NativeRuntime.close()
            sync()
            awaitHost("edits-uploaded")
            note.writeText("Android concurrent edit\n")
            sync(expectConflict = true)
            assertEquals("Android concurrent edit\n", note.readText())
            assertNull(model.repository.mergeReview())
            File(root, "android-sync-waiting.md").writeText("written while Desktop reviews Android conflict\n")
            sync(expectConflict = true)
            awaitHost("needs-desktop-review")
            sync()
            assertEquals("Desktop concurrent edit\n", note.readText())
            awaitHost("resolved")
            record("passed")
        } catch (error: Throwable) {
            stateFile.writeText(JSONObject().put("phase", "failed").put("run", run).put("error", error.toString()).toString())
            throw error
        } finally {
            if (modelReady) {
                compose.runOnUiThread { model.viewModelScope.cancel() }
                model.repository.close()
            }
        }
    }
}
