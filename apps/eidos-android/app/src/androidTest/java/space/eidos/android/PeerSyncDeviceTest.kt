package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

class PeerSyncDeviceTest {
    @Test
    fun roundTripWithDesktopPreservesCloudConfiguration() = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val fixture = File(app.cacheDir, "peer-fixture.json")
        assumeTrue("Run with the Desktop device fixture", fixture.exists())
        val data = JSONObject(fixture.readText())
        val invitation = PeerInvitation.parse(data.getString("invitation"))
        fixture.delete()
        val id = "peer-test-${UUID.randomUUID()}"
        var repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        try {
            val wrong = PeerConnection(invitation.url, "0".repeat(64), invitation.ticket, "Desktop")
            assertTrue(
                runCatching { wrong.call("/pair", JSONObject().put("name", "Android test")) }
                    .isFailure
            )
            val pairing =
                PeerConnection(invitation.url, invitation.fingerprint, invitation.ticket, "Desktop")
            val approved =
                withTimeout(30_000) {
                    var result = pairing.call("/pair", JSONObject().put("name", "Android test"))
                    while (result.optString("state") != "approved") {
                        delay(200)
                        result = pairing.call("/pair", JSONObject().put("name", "Android test"))
                    }
                    result
                }
            val connection =
                PeerConnection(
                    invitation.url,
                    invitation.fingerprint,
                    approved.getString("token"),
                    "Desktop",
                )
            connection.save(app, id)
            assertEquals(connection.fingerprint, PeerConnection.load(app, id)!!.fingerprint)
            NativeGraft.call(
                root.path,
                "configureRemote",
                JSONObject().put("url", "https://cloud.example.test/account/space"),
            )
            var received = 0L
            var sent = 0L
            var downloadTotal = 0L
            val stages = mutableListOf<String>()
            repository.syncPeer(
                connection,
                { rx, tx ->
                    received = maxOf(received, rx)
                    sent = maxOf(sent, tx)
                },
                { value -> downloadTotal = maxOf(downloadTotal, value.optJSONObject("download")?.optLong("total") ?: 0) },
            ) {
                stages.add(it)
            }
            assertTrue(received > 0)
            assertTrue("Graft exposes an aggregate download total", downloadTotal > 0)
            assertTrue(sent > 0)
            assertEquals("电脑正在合并版本", stages.first())
            assertTrue(stages.contains("写入文件"))
            assertEquals("from desktop", File(root, "note.md").readText())
            assertArrayEquals(byteArrayOf(0, -1, 12, 8), File(root, "assets/sample.bin").readBytes())
            assertTrue(File(root, "data.eidos").length() > 0)
            repository.loadEidos("data.eidos")
            val remotes = NativeGraft.call(root.path, "remotes").getJSONArray("remotes")
            val origin =
                (0 until remotes.length())
                    .map { remotes.getJSONObject(it) }
                    .single { it.getString("name") == "origin" }
            assertEquals("https://cloud.example.test/account/space", origin.getString("url"))
            repository.saveText(repository.readText("note.md").copy(text = "from Android"))
            val started = android.os.SystemClock.elapsedRealtime()
            repository.syncPeer(connection) { stage ->
                android.util.Log.i(
                    "PeerPerf",
                    "${android.os.SystemClock.elapsedRealtime() - started}ms $stage",
                )
            }
            android.util.Log.i(
                "PeerPerf",
                "${android.os.SystemClock.elapsedRealtime() - started}ms completed",
            )
            assertEquals("from Android", File(root, "note.md").readText())
            if (!data.optBoolean("conflicts") && !data.optBoolean("recovery"))
                connection.call("/fixture", JSONObject().put("finished", true))
            if (data.optBoolean("conflicts")) {
                suspend fun waitFor(phase: String) = withTimeout(60_000) {
                    while (connection.call("/fixture").optString("phase") != phase) delay(200)
                }
                connection.call("/fixture", JSONObject().put("diverge", true))
                waitFor("diverged")
                repository.saveText(repository.readText("note.md").copy(text = "phone concurrent edit"))
                val conflict = runCatching { repository.syncPeer(connection) {} }.exceptionOrNull()
                assertTrue(conflict?.message ?: "Expected desktop conflict", conflict?.message?.contains("请到电脑") == true)
                assertNull(repository.mergeReview())
                assertEquals("phone concurrent edit", File(root, "note.md").readText())
                File(root, "waiting.md").writeText("written while waiting")
                assertTrue(runCatching { repository.syncPeer(connection) {} }.isFailure)
                connection.call("/fixture", JSONObject().put("reviewed", true))
                waitFor("resolved")
                repository.syncPeer(connection) {}
                assertEquals("reviewed on desktop", File(root, "note.md").readText())
                assertEquals("written while waiting", File(root, "waiting.md").readText())
                connection.call("/fixture", JSONObject().put("finished", true))
            }
            if (data.optBoolean("recovery")) {
                File(root, "offline.md").writeText("edited while disconnected")
                connection.call("/fixture", JSONObject().put("restart", true))
                delay(500)
                assertTrue(runCatching { connection.spaces(timeoutMillis = 1000) }.isFailure)
                if (!data.optBoolean("changePort", true)) {
                    withTimeout(15000) {
                        while (runCatching { connection.spaces(timeoutMillis = 1000) }.isFailure) delay(200)
                    }
                }
                repository.close()
                NativeGraft.call(root.path, "close")
                repository = SpaceRepository(app, id)
                val saved = checkNotNull(PeerConnection.load(app, id))
                val resumed = PeerConnection.reconnect(app, saved, invitation.space)
                if (data.optBoolean("changePort", true)) assertNotEquals(saved.url, resumed.url)
                else assertEquals(saved.url, resumed.url)
                assertEquals(saved.fingerprint, resumed.fingerprint)
                assertEquals(saved.token, resumed.token)
                resumed.save(app, id)
                resumed.saveDevice(app)
                val obsolete = PeerConnection("https://127.0.0.1:1", resumed.fingerprint, resumed.token, resumed.name)
                assertEquals(resumed.url, PeerConnection.reconnect(app, obsolete, invitation.space).url)
                repository.syncPeer(resumed) {}
                assertEquals("desktop restarted", File(root, "recovery.md").readText())
                assertEquals("edited while disconnected", File(root, "offline.md").readText())
                resumed.call("/fixture", JSONObject().put("recovered", true))
            }
        } finally {
            repository.close()
            root.deleteRecursively()
            SyncProfileStore(app, "peer-$id").clear()
            PeerConnection.forgetDevice(app, invitation.fingerprint)
        }
    }
}
