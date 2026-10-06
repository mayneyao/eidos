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
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class RealSpacePeerSyncTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun downloadsWholeSpaceThroughTheActualDownloadAction() = runBlocking {
        val app = compose.activity.application
        val fixture = File(app.cacheDir, "real-space-fixture.json")
        assumeTrue("Provide the isolated whole-Space Desktop fixture", fixture.exists())
        val data = JSONObject(fixture.readText())
        val invitation = PeerInvitation.parse(data.getString("invitation"))
        val initialId = "real-space-launch-${UUID.randomUUID()}"
        lateinit var model: EidosModel
        var connection: PeerConnection? = null
        var success = false
        try {
            compose.runOnUiThread {
                model = EidosModel(app, SpaceRepository(app, initialId))
                model.peerSelectedDevice = invitation.fingerprint
                compose.activity.setContent {
                    val state = model.state.collectAsState()
                    MaterialTheme(colorScheme = eidosColorScheme()) { SyncScreen(state.value, model) }
                }
                if (PeerConnection.load(app, "device-${invitation.fingerprint}") == null) {
                    model.pairPeer(data.getString("invitation"))
                } else {
                    model.peerSelectedDevice = invitation.fingerprint
                    model.browsePeerSpaces(invitation.fingerprint)
                }
            }
            compose.waitUntil(30_000) { !model.state.value.peerBusy && model.state.value.peerSpaces.any { it.fingerprint == invitation.fingerprint } }
            connection = checkNotNull(PeerConnection.load(app, "device-${invitation.fingerprint}"))
            compose.runOnUiThread { model.refreshPeerAvailability() }
            compose.waitUntil(60_000) { model.state.value.peerAvailability[invitation.fingerprint]?.reachable == true }
            val existing = SpaceCatalog(app).peerLocalSpaces().firstOrNull { it.fingerprint == invitation.fingerprint }
            compose.onNodeWithText(existing?.name ?: "my-eidos-space").assertIsDisplayed()
            val alreadyDownloaded = existing != null
            if (alreadyDownloaded) compose.onAllNodesWithText("同步").filterToOne(hasClickAction()).performClick()
            else compose.onNodeWithText("下载").performClick()
            val started = android.os.SystemClock.elapsedRealtime()
            var last = ""
            val plannedSamples = mutableListOf<Pair<Long, Long>>()
            compose.waitUntil(900_000) {
                val progress = model.state.value.peerProgress
                val stage = progress?.stage ?: ""
                if (stage == "下载数据" && progress?.downloadPlanned == true && progress.downloadTotal != null) {
                    val sample = progress.downloadBytes to progress.downloadTotal
                    if (plannedSamples.lastOrNull() != sample) plannedSamples.add(sample)
                }
                if (stage != last) {
                    last = stage
                    android.util.Log.i("RealSpacePeer", "${android.os.SystemClock.elapsedRealtime() - started}ms $stage ${progress?.error.orEmpty()}")
                }
                progress?.finishedAt != null
            }
            compose.onRoot().captureToImage().asAndroidBitmap().let { bitmap ->
                File(app.cacheDir, "real-space-sync.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            }
            val state = model.state.value
            File(app.cacheDir, "real-space-planned-progress.json").writeText(org.json.JSONArray(plannedSamples.map { (bytes, total) ->
                JSONObject().put("transferred", bytes).put("total", total)
            }).toString())
            if (!alreadyDownloaded) {
                assertTrue("A complete snapshot download plan must be observable", plannedSamples.isNotEmpty())
                assertEquals("The download denominator must remain fixed across all databases", 1, plannedSamples.map { it.second }.distinct().size)
                assertTrue("Transferred bytes must never go backwards", plannedSamples.zipWithNext().all { (a, b) -> b.first >= a.first })
                assertTrue("The plan must be available before all bytes are received", plannedSamples.any { it.first < it.second })
                assertTrue("The plan must remain valid through completion", state.peerProgress?.downloadPlanned == true)
                assertEquals("All planned bytes must be received", state.peerProgress?.downloadTotal, state.peerProgress?.downloadBytes)
                assertEquals(plannedSamples.first().second, state.peerProgress?.downloadTotal)
            }
            File(app.cacheDir, "real-space-result.json").writeText(JSONObject()
                .put("spaceId", state.spaceId).put("stage", state.peerProgress?.stage)
                .put("error", state.peerProgress?.error).put("warning", state.peerProgress?.warning)
                .put("downloadBytes", state.peerProgress?.downloadBytes)
                .put("elapsedMs", android.os.SystemClock.elapsedRealtime() - started).toString())
            assertNull(state.peerProgress?.error ?: state.error, state.peerProgress?.error)
            assertEquals("同步完成", state.peerProgress?.stage)
            val local = SpaceCatalog(app).peerLocalSpaces().single { it.fingerprint == invitation.fingerprint }
            assertEquals(local.id, state.spaceId)
            assertNotNull(local.lastSynced)
            val manifest = connection.call("/fixture", JSONObject().put("manifest", true)).getJSONArray("manifest")
            var bytes = 0L
            var rawMatches = 0
            val root = File(app.filesDir, "spaces/${local.id}")
            for (index in 0 until manifest.length()) {
                val entry = manifest.getJSONObject(index)
                val file = File(root, entry.getString("path"))
                assertTrue("Missing ${entry.getString("path")}", file.isFile)
                assertEquals("Size ${entry.getString("path")}", entry.getLong("bytes"), file.length())
                val hash = MessageDigest.getInstance("SHA-256")
                val contentHash = MessageDigest.getInstance("SHA-256")
                var offset = 0L
                file.inputStream().use { input ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val size = input.read(buffer); if (size < 0) break
                        hash.update(buffer, 0, size)
                        if (file.extension == "eidos") for (start in listOf(24, 92, 96)) for (position in start until start + 4)
                            if (position >= offset && position < offset + size) buffer[(position - offset).toInt()] = 0
                        contentHash.update(buffer, 0, size)
                        offset += size
                    }
                }
                if (entry.getString("sha256") == hash.digest().joinToString("") { "%02x".format(it) }) rawMatches++
                assertEquals("Contents ${entry.getString("path")}", entry.getString("contentSha256"), contentHash.digest().joinToString("") { "%02x".format(it) })
                bytes += file.length()
            }
            File(app.cacheDir, "real-space-verification.json").writeText(JSONObject().put("files", manifest.length()).put("bytes", bytes).put("rawMatches", rawMatches).put("sqliteCounterNormalizedMatches", manifest.length()).toString())
            android.util.Log.i("RealSpacePeer", "Verified ${manifest.length()} files, $bytes bytes, $rawMatches raw SHA-256 matches; all SQLite pages match except header counters and writer version")
            success = true
        } finally {
            connection?.call("/fixture", JSONObject().put("finished", success).also {
                if (!success) it.put("error", model.state.value.peerProgress?.error ?: "Android verification failed; inspect instrumentation output")
            })
            compose.runOnUiThread { model.viewModelScope.cancel() }
            model.repository.close()
            NativeGraft.call(File(app.filesDir, "spaces/$initialId").apply { mkdirs() }.path, "close")
            File(app.filesDir, "spaces/$initialId").deleteRecursively()
        }
    }
}
