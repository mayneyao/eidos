package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class DesktopCompatibilityTest {
    @Test
    fun exchangesPortableFilesWithDesktopRuntime(): Unit = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val args = InstrumentationRegistry.getArguments()
        val phase = args.getString("compatPhase", "local")
        require(phase in setOf("local", "prepare", "verify", "startSync", "verifySync"))
        val id = args.getString("compatRun") ?: UUID.randomUUID().toString()
        require(id.matches(Regex("[a-zA-Z0-9-]+")))
        if (phase == "startSync" || phase == "verifySync") {
            interruptedSync(id, phase, checkNotNull(args.getString("graftRemoteUrl")))
            return@runBlocking
        }
        val root = File(instrumentation.targetContext.cacheDir, "compatibility/$id")
        val database = File(root, "records.eidos")
        val drafts = SpaceRepository(instrumentation.targetContext, id)
        val bytes = ByteArray(8192) { (it % 251).toByte() }
        try {
            if (phase != "verify") {
                check(!root.exists() && root.mkdirs())
                NativeRuntime.call(database.path, "create", JSONObject().put("title", "跨端资料"))
                val schema = NativeRuntime.call(database.path, "schema")
                val objects = schema.getJSONArray("objects")
                val table =
                    (0 until objects.length()).map(objects::getJSONObject).first {
                        it.getString("object") == "table"
                    }
                val manifest =
                    JSONObject()
                        .put("table", table.getString("id"))
                        .put("label", table.getString("labelFieldId"))
                File(root, "manifest.json").writeText(manifest.toString())
                NativeRuntime.call(
                    database.path,
                    "mutateRows",
                    JSONObject()
                        .put("tableId", manifest.getString("table"))
                        .put(
                            "expectedRevision",
                            schema.getJSONObject("snapshot").getString("revision"),
                        )
                        .put(
                            "changes",
                            JSONArray()
                                .put(
                                    JSONObject()
                                        .put("kind", "create")
                                        .put("clientKey", "android")
                                        .put(
                                            "values",
                                            JSONObject()
                                                .put(manifest.getString("label"), "Android 离线记录 🌱"),
                                        )
                                ),
                        ),
                )
                File(root, "note.md").writeText("# Android\r\n\r\n[附件](assets/data.bin)\r\n")
                File(root, "assets").mkdir()
                File(root, "assets/data.bin").writeBytes(bytes)
                val note = drafts.create("", "draft", "markdown")
                drafts.saveDraft(drafts.readText(note).copy(text = "进程重启后恢复的草稿"))
            }
            val manifest = JSONObject(File(root, "manifest.json").readText())
            val rows =
                NativeRuntime.call(
                        database.path,
                        "queryRows",
                        JSONObject()
                            .put("tableId", manifest.getString("table"))
                            .put("query", JSONObject())
                            .put("limit", 50)
                            .put(
                                "projection",
                                JSONObject()
                                    .put("fields", JSONArray().put(manifest.getString("label")))
                                    .put("resolveRelations", JSONArray()),
                            ),
                    )
                    .getJSONArray("rows")
            val values =
                (0 until rows.length()).map {
                    rows.getJSONObject(it).getJSONArray("values").getString(0)
                }
            assertTrue(values.contains("Android 离线记录 🌱"))
            if (phase == "verify") assertTrue(values.contains("Desktop 回写记录"))
            assertEquals(if (phase == "verify") 2 else 1, rows.length())
            assertArrayEquals(bytes, File(root, "assets/data.bin").readBytes())
            assertEquals(
                "# Android\r\n\r\n[附件](assets/data.bin)\r\n",
                File(root, "note.md").readText(),
            )
            val recovered = drafts.readText("draft.md")
            assertTrue(recovered.recovered)
            assertEquals("进程重启后恢复的草稿", recovered.text)
        } finally {
            NativeRuntime.close()
            if (phase != "prepare") {
                root.deleteRecursively()
                File(instrumentation.targetContext.filesDir, "spaces/$id").deleteRecursively()
                File(instrumentation.targetContext.filesDir, "drafts-$id").deleteRecursively()
            }
        }
    }

    private suspend fun interruptedSync(id: String, phase: String, url: String) {
        require(url.startsWith("http://127.0.0.1:"))
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repository = SpaceRepository(context, id)
        val root = File(context.filesDir, "spaces/$id")
        val content = ByteArray(8192) { (it % 251).toByte() }
        if (phase == "startSync") {
            val note = repository.create("", "note", "markdown")
            repository.saveText(repository.readText(note).copy(text = "同步中断也要保留"))
            val path = repository.create("", "records", "eidos")
            val page = repository.loadEidos(path)
            repository.mutate(page, null, mapOf(page.table!!.labelFieldId to "中断前的记录"))
            File(root, "asset.bin").writeBytes(content)
            repository.connectRemote(url, "ephemeral-test-token")
            repository.syncRemote()
            error("The controller should stop this process during the HTTP request")
        }
        val peerId = "$id-peer"
        val peer = SpaceRepository(context, peerId)
        try {
            assertEquals("interrupted", repository.graftStatus().syncStatus)
            assertEquals("同步中断也要保留", repository.readText("note.md").text)
            assertArrayEquals(content, File(root, "asset.bin").readBytes())
            val page = repository.loadEidos("records.eidos")
            val label = page.table!!.labelFieldId
            assertEquals("中断前的记录", page.rows.single().values[label])
            repository.mutate(page, null, mapOf(label to "重启后继续编辑"))
            // The controller replaces the stalled endpoint with a real empty Graft remote.
            assertEquals("synced", repository.syncRemote(publish = true))
            assertEquals("completed", repository.graftStatus().syncStatus)
            peer.cloneRemote(url, "ephemeral-test-token")
            assertEquals(2, peer.loadEidos("records.eidos").rows.size)
            assertEquals("同步中断也要保留", peer.readText("note.md").text)
            assertArrayEquals(
                content,
                File(context.filesDir, "spaces/$peerId/asset.bin").readBytes(),
            )
        } finally {
            repository.close()
            peer.close()
            root.deleteRecursively()
            File(context.filesDir, "spaces/$peerId").deleteRecursively()
            context.deleteSharedPreferences("space-$id")
            context.deleteSharedPreferences("space-$peerId")
        }
    }
}
