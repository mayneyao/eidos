package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SemanticMergeTest {
    @Test
    fun mergesIndependentOfflineRecordsThroughNativeRuntimeAndPublishes() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val root = File(context.cacheDir, "semantic-${UUID.randomUUID()}").apply { mkdirs() }
        val source = File(root, "source").apply { mkdir() }
        val phone = File(root, "phone").apply { mkdir() }
        val remote = File(root, "remote").apply { mkdir() }
        val connection = JSONObject().put("url", "fs://${remote.path}")
        try {
            NativeRuntime.call(
                File(source, "records.eidos").path,
                "create",
                JSONObject().put("title", "离线合并"),
            )
            NativeGraft.call(source.path, "checkpoint")
            NativeGraft.call(source.path, "configureRemote", connection)
            NativeGraft.call(source.path, "push")
            NativeGraft.call(phone.path, "clone", connection)
            addRecord(File(phone, "records.eidos"), "手机记录")
            addRecord(File(source, "records.eidos"), "电脑记录")
            NativeGraft.call(phone.path, "checkpoint")
            NativeGraft.call(source.path, "checkpoint")
            NativeGraft.call(source.path, "configureRemote", connection)
            NativeGraft.call(source.path, "push")
            NativeGraft.call(phone.path, "configureRemote", connection)
            NativeGraft.call(phone.path, "fetch")
            val start = NativeGraft.call(phone.path, "beginMerge").getJSONObject("merge")
            assertEquals("merging", start.getString("state"))
            val result =
                NativeGraft.call(
                    phone.path,
                    "mergeMetadata",
                    JSONObject().put("stateToken", start.getString("state_token")),
                )
            assertEquals(
                "merged",
                result
                    .getJSONArray("files")
                    .getJSONObject(0)
                    .getJSONObject("result")
                    .getString("outcome"),
            )
            val merge = result.getJSONObject("merge")
            assertEquals(0, merge.getInt("unmerged_count"))
            NativeGraft.call(phone.path, "close")
            assertEquals(merge.toString(), NativeGraft.call(phone.path, "mergeStatus").toString())
            NativeGraft.call(
                phone.path,
                "continueMerge",
                JSONObject().put("stateToken", merge.getString("state_token")),
            )
            NativeGraft.call(phone.path, "configureRemote", connection)
            NativeGraft.call(phone.path, "push")
            NativeGraft.call(source.path, "configureRemote", connection)
            NativeGraft.call(source.path, "fetch")
            NativeGraft.call(source.path, "fastForward")
            for (directory in listOf(source, phone)) {
                val data = File(directory, "records.eidos")
                val table = table(data)
                val resultRows =
                    NativeRuntime.call(
                            data.path,
                            "queryRows",
                            JSONObject()
                                .put("tableId", table.getString("id"))
                                .put("query", JSONObject())
                                .put("limit", 50)
                                .put(
                                    "projection",
                                    JSONObject()
                                        .put(
                                            "fields",
                                            JSONArray().put(table.getString("labelFieldId")),
                                        )
                                        .put("resolveRelations", JSONArray()),
                                ),
                        )
                        .getJSONArray("rows")
                assertEquals(
                    setOf("手机记录", "电脑记录"),
                    (0 until resultRows.length())
                        .map { resultRows.getJSONObject(it).getJSONArray("values").getString(0) }
                        .toSet(),
                )
            }
        } finally {
            NativeGraft.call(phone.path, "close")
            NativeGraft.call(source.path, "close")
            root.deleteRecursively()
        }
    }

    private fun table(file: File): JSONObject {
        val objects = NativeRuntime.call(file.path, "schema").getJSONArray("objects")
        return (0 until objects.length()).map(objects::getJSONObject).first {
            it.getString("object") == "table"
        }
    }

    private fun addRecord(file: File, title: String) {
        val table = table(file)
        val schema = NativeRuntime.call(file.path, "schema")
        NativeRuntime.call(
            file.path,
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
                                .put("clientKey", "new")
                                .put(
                                    "values",
                                    JSONObject().put(table.getString("labelFieldId"), title),
                                )
                        ),
                ),
        )
    }
}
