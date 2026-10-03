package space.eidos.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GraftDeviceTest {
    @Test
    fun peerMergeCombinesDifferentFilesAndRetainsRealConflicts() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val root = File(app.cacheDir, "peer-merge-${UUID.randomUUID()}").apply { mkdirs() }
        val desktop = File(root, "desktop").apply { mkdir() }
        val phone = File(root, "phone").apply { mkdir() }
        val remote = File(root, "remote").apply { mkdir() }
        val config = JSONObject().put("url", "fs://${remote.path}")
        fun call(dir: File, method: String) = NativeGraft.call(dir.path, method)
        try {
            File(desktop, "a.md").writeText("base a\n")
            File(desktop, "b.md").writeText("base b\n")
            call(desktop, "checkpoint")
            NativeGraft.call(desktop.path, "peerConfigure", config)
            call(desktop, "peerPush")
            NativeGraft.call(phone.path, "clone", config)
            NativeGraft.call(phone.path, "peerConfigure", config)
            File(desktop, "a.md").writeText("desktop edit\n")
            File(phone, "b.md").writeText("phone edit\n")
            call(desktop, "checkpoint")
            call(desktop, "peerPush")
            call(phone, "checkpoint")
            call(phone, "peerFetch")
            assertEquals("updated", call(phone, "peerFastForward").getString("outcome"))
            assertEquals("none", call(phone, "mergeStatus").getString("state"))
            assertEquals("desktop edit\n", File(phone, "a.md").readText())
            assertEquals("phone edit\n", File(phone, "b.md").readText())
            call(phone, "peerPush")
            call(desktop, "peerFetch")
            call(desktop, "peerFastForward")
            assertEquals("phone edit\n", File(desktop, "b.md").readText())
            File(desktop, "a.md").writeText("desktop conflict\n")
            File(phone, "a.md").writeText("phone conflict\n")
            call(desktop, "checkpoint")
            call(desktop, "peerPush")
            call(phone, "checkpoint")
            call(phone, "peerFetch")
            assertEquals("needs_merge", call(phone, "peerFastForward").getString("outcome"))
            assertEquals("merging", call(phone, "mergeStatus").getString("state"))
            assertEquals("phone conflict\n", File(phone, "a.md").readText())
        } finally {
            call(phone, "close")
            call(desktop, "close")
            root.deleteRecursively()
        }
    }

    @Test
    fun nativeRemoteRoundtripMaterializesCompleteFiles() {
        remoteRoundtrip(null)
    }

    @Test
    fun nativeHttpRemoteRoundtripMaterializesCompleteFiles() {
        val http = InstrumentationRegistry.getArguments().getString("graftRemoteUrl")
        Assume.assumeNotNull(http)
        remoteRoundtrip(checkNotNull(http))
    }

    private fun remoteRoundtrip(http: String?) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val root =
            File(instrumentation.targetContext.cacheDir, "remote-test-${UUID.randomUUID()}").apply {
                mkdirs()
            }
        val source = File(root, "source").apply { mkdir() }
        val clone = File(root, "clone").apply { mkdir() }
        val remote = File(root, "remote").apply { mkdir() }
        require(
            http == null ||
                (http.startsWith("http://127.0.0.1:") &&
                    (http.removePrefix("http://127.0.0.1:").toIntOrNull() ?: 0) in 1..65535)
        ) {
            "Use the adb-reversed loopback test fixture"
        }
        val url =
            http?.let { "graft+$it/android/test-${UUID.randomUUID()}" } ?: "fs://${remote.path}"
        val connection = JSONObject().put("url", url).put("token", "ephemeral-test-token")
        val content = ByteArray(131072) { it.toByte() }
        try {
            File(source, "笔记.md").writeText("# 原始笔记\n")
            File(source, "附件.bin").writeBytes(content)
            NativeRuntime.call(
                File(source, "资料.eidos").path,
                "create",
                JSONObject().put("title", "同步资料"),
            )
            NativeGraft.call(source.path, "checkpoint")
            NativeGraft.call(source.path, "configureRemote", connection)
            NativeGraft.call(source.path, "push")
            NativeGraft.call(clone.path, "clone", connection)
            assertEquals("# 原始笔记\n", File(clone, "笔记.md").readText())
            assertArrayEquals(content, File(clone, "附件.bin").readBytes())
            val data = File(clone, "资料.eidos").path
            val schema = NativeRuntime.call(data, "schema")
            val objects = schema.getJSONArray("objects")
            val table =
                (0 until objects.length()).map(objects::getJSONObject).first {
                    it.getString("object") == "table"
                }
            NativeRuntime.call(
                data,
                "mutateRows",
                JSONObject()
                    .put("tableId", table.getString("id"))
                    .put("expectedRevision", schema.getJSONObject("snapshot").getString("revision"))
                    .put(
                        "changes",
                        JSONArray()
                            .put(
                                JSONObject()
                                    .put("kind", "create")
                                    .put("clientKey", "remote")
                                    .put(
                                        "values",
                                        JSONObject().put(table.getString("labelFieldId"), "来自另一端"),
                                    )
                            ),
                    ),
            )
            File(clone, "笔记.md").writeText("# 另一端的修改\n")
            NativeGraft.call(clone.path, "checkpoint")
            NativeGraft.call(clone.path, "push")
            NativeGraft.call(source.path, "configureRemote", connection)
            NativeGraft.call(source.path, "fetch")
            assertEquals("# 原始笔记\n", File(source, "笔记.md").readText())
            assertEquals(
                "updated",
                NativeGraft.call(source.path, "fastForward").getString("outcome"),
            )
            assertEquals("# 另一端的修改\n", File(source, "笔记.md").readText())
            val rows =
                NativeRuntime.call(
                    File(source, "资料.eidos").path,
                    "queryRows",
                    JSONObject()
                        .put("tableId", table.getString("id"))
                        .put("query", JSONObject())
                        .put("limit", 50)
                        .put(
                            "projection",
                            JSONObject()
                                .put("fields", JSONArray().put(table.getString("labelFieldId")))
                                .put("resolveRelations", JSONArray()),
                        ),
                )
            assertEquals(
                "来自另一端",
                rows.getJSONArray("rows").getJSONObject(0).getJSONArray("values").getString(0),
            )
            assertArrayEquals(content, File(source, "附件.bin").readBytes())
            NativeGraft.call(source.path, "clearCredentials")
            if (http != null)
                assertTrue(runCatching { NativeGraft.call(source.path, "fetch") }.isFailure)
        } finally {
            NativeGraft.call(source.path, "close")
            NativeGraft.call(clone.path, "close")
            root.deleteRecursively()
        }
    }

    @Test
    fun checkpointSurvivesSessionReopenAndTracksAllFileKinds() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val root = File(context.cacheDir, "graft-test-${UUID.randomUUID()}").apply { mkdirs() }
        try {
            assertFalse(NativeGraft.call(root.path, "status").getBoolean("initialized"))
            File(root, "笔记.md").writeText("# 离线笔记\n")
            val attachment = File(root, "附件.bin")
            attachment.writeBytes(byteArrayOf(0, 127, -1, 13))
            NativeRuntime.call(
                File(root, "资料.eidos").path,
                "create",
                JSONObject().put("title", "手机资料"),
            )
            val saved = NativeGraft.call(root.path, "checkpoint")
            assertFalse(saved.getJSONObject("status").getBoolean("dirty"))
            assertEquals(1, NativeGraft.call(root.path, "history").getJSONArray("commits").length())
            val original = NativeGraft.call(root.path, "history").getString("current_head")
            NativeGraft.call(root.path, "close")
            assertFalse(
                NativeGraft.call(root.path, "status").getJSONObject("status").getBoolean("dirty")
            )
            attachment.appendBytes(byteArrayOf(8))
            assertTrue(
                NativeGraft.call(root.path, "status").getJSONObject("status").getBoolean("dirty")
            )
            assertFalse(
                NativeGraft.call(root.path, "checkpoint")
                    .getJSONObject("status")
                    .getBoolean("dirty")
            )
            assertEquals(2, NativeGraft.call(root.path, "history").getJSONArray("commits").length())
            val data = File(root, "资料.eidos").path
            val schema = NativeRuntime.call(data, "schema")
            val objects = schema.getJSONArray("objects")
            val table =
                (0 until objects.length()).map(objects::getJSONObject).first {
                    it.getString("object") == "table"
                }
            NativeRuntime.call(
                data,
                "mutateRows",
                JSONObject()
                    .put("tableId", table.getString("id"))
                    .put("expectedRevision", schema.getJSONObject("snapshot").getString("revision"))
                    .put(
                        "changes",
                        JSONArray()
                            .put(
                                JSONObject()
                                    .put("kind", "create")
                                    .put("clientKey", "mobile")
                                    .put(
                                        "values",
                                        JSONObject().put(table.getString("labelFieldId"), "恢复前的记录"),
                                    )
                            ),
                    ),
            )
            NativeGraft.call(root.path, "checkpoint")
            val head = NativeGraft.call(root.path, "history").getString("current_head")
            NativeGraft.call(
                root.path,
                "restore",
                JSONObject()
                    .put("path", "资料.eidos")
                    .put("source", original)
                    .put("expectedHead", head),
            )
            val rows =
                NativeRuntime.call(
                    data,
                    "queryRows",
                    JSONObject()
                        .put("tableId", table.getString("id"))
                        .put("query", JSONObject())
                        .put("limit", 50)
                        .put(
                            "projection",
                            JSONObject()
                                .put("fields", JSONArray().put(table.getString("labelFieldId")))
                                .put("resolveRelations", JSONArray()),
                        ),
                )
            assertEquals(0, rows.getJSONArray("rows").length())
            NativeGraft.call(root.path, "checkpoint")
            NativeGraft.call(
                root.path,
                "restore",
                JSONObject()
                    .put("path", "附件.bin")
                    .put("source", original)
                    .put(
                        "expectedHead",
                        NativeGraft.call(root.path, "history").getString("current_head"),
                    ),
            )
            assertArrayEquals(byteArrayOf(0, 127, -1, 13), attachment.readBytes())
            assertEquals("# 离线笔记\n", File(root, "笔记.md").readText())
            assertTrue(
                NativeRuntime.call(File(root, "资料.eidos").path, "schema")
                    .getJSONArray("objects")
                    .length() > 0
            )
        } finally {
            NativeGraft.call(root.path, "close")
            root.deleteRecursively()
        }
    }
}
