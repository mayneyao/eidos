package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Opt-in native device benchmark; always creates a new isolated receiver. */
class PeerPerformanceTest {
    @Test fun wholeSpaceAndIncremental() = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val fixture = File(app.cacheDir, "real-space-fixture.json")
        assumeTrue("Requires an isolated Desktop fixture", fixture.exists())
        val invitation = PeerInvitation.parse(JSONObject(fixture.readText()).getString("invitation"))
        val pairing = PeerConnection(invitation.url, invitation.fingerprint, invitation.ticket, "Desktop")
        val approved = withTimeout(30_000) {
            var value = pairing.call("/pair", JSONObject().put("name", "Android performance"))
            while (value.optString("state") != "approved") { delay(200); value = pairing.call("/pair", JSONObject().put("name", "Android performance")) }
            value
        }
        val connection = PeerConnection(invitation.url, invitation.fingerprint, approved.getString("token"), "Desktop")
        val id = "sync-performance-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val measurements = JSONArray()
        val relayProbes = JSONArray()
        var failure: String? = null
        suspend fun measure(phase: String) {
            connection.call("/fixture", JSONObject().put("phase", phase))
            val begin = android.os.SystemClock.elapsedRealtime()
            val stages = JSONArray()
            val transfers = java.util.Collections.synchronizedList(mutableListOf<JSONObject>())
            val graftTransfers = java.util.Collections.synchronizedList(mutableListOf<JSONObject>())
            var received = 0L; var sent = 0L
            var graft = JSONObject()
            repository.syncPeer(connection, { rx, tx ->
                received = rx; sent = tx
                transfers.add(JSONObject().put("ms", android.os.SystemClock.elapsedRealtime() - begin)
                    .put("received", rx).put("sent", tx))
            }, {
                graft = it
                graftTransfers.add(JSONObject(it.toString()).put("ms", android.os.SystemClock.elapsedRealtime() - begin))
            }) {
                val ms = android.os.SystemClock.elapsedRealtime() - begin
                stages.put(JSONObject().put("stage", it).put("ms", ms))
                android.util.Log.i("PeerPerformance", "$phase ${ms}ms $it")
            }
            measurements.put(JSONObject().put("phase", phase).put("ms", android.os.SystemClock.elapsedRealtime() - begin)
                .put("wireReceived", received).put("wireSent", sent).put("graft", graft).put("stages", stages)
                .put("transfers", synchronized(transfers) { JSONArray(transfers.toList()) })
                .put("graftTransfers", synchronized(graftTransfers) { JSONArray(graftTransfers.toList()) }))
            File(app.cacheDir, "real-space-performance.json").writeText(JSONObject().put("root", root.path).put("measurements", measurements).put("relayProbeMs", relayProbes).toString())
        }
        try {
            // Exercise client-initiated EOF, with a keep-alive server response.
            // More than eight sequential sockets must not exhaust relay slots.
            connection.tunnel().use { tunnel ->
                val endpoint = java.net.URI(tunnel.remoteUrl.removePrefix("graft+"))
                repeat(16) {
                    val probeStarted = android.os.SystemClock.elapsedRealtime()
                    java.net.Socket(endpoint.host, endpoint.port).use { socket ->
                        socket.soTimeout = 5_000
                        socket.getOutputStream().write(("HEAD /peer/space/raw/store/files/probe HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer ${connection.token}\r\nConnection: keep-alive\r\n\r\n").toByteArray())
                        val headers = StringBuilder()
                        while (!headers.endsWith("\r\n\r\n")) {
                            val byte = socket.getInputStream().read()
                            assertTrue("Relay slot was not released after local EOF", byte >= 0)
                            headers.append(byte.toChar())
                            assertTrue(headers.length < 8192)
                        }
                        assertTrue(headers.toString(), headers.startsWith("HTTP/1.1"))
                    }
                    relayProbes.put(android.os.SystemClock.elapsedRealtime() - probeStarted)
                }
            }
            File(app.cacheDir, "real-space-relay-probes.json").writeText(
                JSONObject().put("relayProbeMs", relayProbes).toString()
            )
            if (InstrumentationRegistry.getArguments().getString("relayProbeOnly") == "true")
                return@runBlocking
            measure("download")
            val manifest = connection.call("/fixture", JSONObject().put("manifest", true)).getJSONArray("manifest")
            for (index in 0 until manifest.length()) {
                val item = manifest.getJSONObject(index)
                val file = File(root, item.getString("path"))
                assertEquals(item.getString("path"), item.getLong("bytes"), file.length())
                val hash = MessageDigest.getInstance("SHA-256")
                var offset = 0L
                file.inputStream().use { input ->
                    val buffer = ByteArray(1024 * 1024)
                    while (true) {
                        val size = input.read(buffer); if (size < 0) break
                        if (file.extension == "eidos") for (start in listOf(24, 92, 96)) for (position in start until start + 4)
                            if (position >= offset && position < offset + size) buffer[(position - offset).toInt()] = 0
                        hash.update(buffer, 0, size); offset += size
                    }
                }
                assertEquals(item.getString("path"), item.getString("contentSha256"), hash.digest().joinToString("") { "%02x".format(it) })
            }
            measure("noop")
            measure("noop-steady")
            File(root, "sync-performance-mobile.md").writeText("from mobile\n")
            val database = File(root, "sync-performance.eidos")
            NativeRuntime.call(database.path, "create", JSONObject().put("title", "Sync performance"))
            val schema = NativeRuntime.call(database.path, "schema")
            val objects = schema.getJSONArray("objects")
            val table = (0 until objects.length()).map { objects.getJSONObject(it) }.first { it.optString("object") == "table" }
            val tableId = table.getString("id")
            val label = table.getString("labelFieldId")
            NativeRuntime.call(database.path, "mutateRows", JSONObject().put("tableId", tableId).put("expectedRevision", schema.getJSONObject("snapshot").get("revision"))
                .put("changes", JSONArray().put(JSONObject().put("kind", "create").put("clientKey", "performance").put("values", JSONObject().put(label, "edited on mobile")))))
            NativeRuntime.close()
            measure("upload")
            assertEquals("from mobile\n", connection.call("/fixture").getString("mobile"))
            val databaseOptions = JSONObject().put("tableId", tableId).put("label", label)
            assertTrue(connection.call("/fixture", JSONObject().put("database", databaseOptions)).getJSONArray("databaseRows").toString().contains("edited on mobile"))
            connection.call("/fixture", JSONObject().put("mutation", "from desktop\n").put("database", databaseOptions.put("insert", true)))
            measure("incremental-download")
            assertEquals("from desktop\n", File(root, "sync-performance-desktop.md").readText())
            val query = NativeRuntime.call(database.path, "queryRows", JSONObject().put("tableId", tableId).put("query", JSONObject())
                .put("projection", JSONObject().put("fields", JSONArray().put(label)).put("resolveRelations", JSONArray())).put("limit", 50))
            assertTrue(query.toString(), query.toString().contains("edited on desktop"))
        } catch (error: Throwable) { failure = error.toString(); throw error }
        finally {
            connection.call("/fixture", JSONObject().put("finished", true).also { if (failure != null) it.put("error", failure) })
            repository.close()
            NativeGraft.call(root.path, "close")
            // Keep this test-owned receiver for investigating or verifying results.
        }
    }
}
