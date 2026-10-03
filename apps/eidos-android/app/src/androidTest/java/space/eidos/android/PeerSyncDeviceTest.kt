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
        val invitation =
            PeerInvitation.parse(JSONObject(fixture.readText()).getString("invitation"))
        fixture.delete()
        val id = "peer-test-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
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
            val stages = mutableListOf<String>()
            repository.syncPeer(
                connection,
                { rx, tx ->
                    received = maxOf(received, rx)
                    sent = maxOf(sent, tx)
                },
            ) {
                stages.add(it)
            }
            assertTrue(received > 0)
            assertTrue(sent > 0)
            assertEquals("电脑正在准备同步数据", stages.first())
            assertTrue(stages.contains("正在写入本地文件"))
            assertEquals("from desktop", File(root, "note.md").readText())
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
        } finally {
            repository.close()
            root.deleteRecursively()
            SyncProfileStore(app, "peer-$id").clear()
        }
    }
}
