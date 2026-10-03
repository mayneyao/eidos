package space.eidos.android

import android.net.Uri
import androidx.core.content.FileProvider
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AttachmentImportTest {
    @Test
    fun storesPortableAttachmentsAndRollsBackRejectedImports(): Unit = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "attachments-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val fixture = File(app.cacheDir, "test-share/$id").apply { mkdirs() }
        fun uri(file: File) = FileProvider.getUriForFile(app, "${app.packageName}.testshare", file)
        val first =
            File(fixture, "a/图 片.png").apply {
                parentFile!!.mkdirs()
                writeBytes(byteArrayOf(1, 2, 3, 4))
            }
        val second =
            File(fixture, "b/图 片.png").apply {
                parentFile!!.mkdirs()
                writeBytes(byteArrayOf(5, 6, 7))
            }
        val folder = repository.create("", "项目", "folder")
        val path = "$folder/数据.eidos"
        try {
            NativeRuntime.call(
                File(root, path).path,
                "create",
                JSONObject()
                    .put("title", "附件")
                    .put(
                        "fields",
                        JSONArray()
                            .put(
                                JSONObject()
                                    .put("clientKey", "title")
                                    .put("name", "标题")
                                    .put("kind", "text")
                                    .put("position", "0")
                            )
                            .put(
                                JSONObject()
                                    .put("clientKey", "files")
                                    .put("name", "附件")
                                    .put("kind", "file")
                                    .put("position", "1")
                            ),
                    ),
            )
            val empty = repository.loadEidos(path)
            val label = checkNotNull(empty.table).labelFieldId
            val field = empty.fields.single { it.kind == "file" }.id
            repository.mutateWithAttachments(
                empty,
                null,
                mapOf(label to "分享附件"),
                field,
                listOf(uri(first), uri(second)),
            )
            val saved = repository.loadEidos(path)
            val entries = saved.rows.single().values[field] as JSONArray
            assertEquals(2, entries.length())
            assertEquals("4", entries.getJSONObject(0).getString("size"))
            assertEquals("image/png", entries.getJSONObject(0).getString("mediaType"))
            assertEquals('7', entries.getJSONObject(0).getString("id")[14])
            assertNotEquals(
                entries.getJSONObject(0).getString("id"),
                entries.getJSONObject(1).getString("id"),
            )
            for (index in 0..1) {
                val entry = entries.getJSONObject(index)
                val relative = entry.getString("uri")
                assertTrue(relative.startsWith("assets/"))
                assertFalse(relative.contains(" "))
                val local = File(root, "$folder/${Uri.decode(relative)}")
                assertArrayEquals(
                    if (index == 0) first.readBytes() else second.readBytes(),
                    local.readBytes(),
                )
            }
            val assets = File(root, "$folder/assets")
            val before = assets.walkTopDown().map { it.relativeTo(assets).path }.toSet()
            assertTrue(
                runCatching {
                        repository.mutateWithAttachments(
                            saved,
                            null,
                            mapOf(label to "失败的分享"),
                            field,
                            listOf(uri(first), uri(File(fixture, "missing.png"))),
                        )
                    }
                    .isFailure
            )
            assertEquals(before, assets.walkTopDown().map { it.relativeTo(assets).path }.toSet())
            assertEquals(saved.revision, repository.loadEidos(path).revision)
            assertTrue(
                runCatching {
                        repository.mutateWithAttachments(
                            saved,
                            null,
                            mapOf(label to true),
                            field,
                            listOf(uri(first)),
                        )
                    }
                    .isFailure
            )
            assertEquals(before, assets.walkTopDown().map { it.relativeTo(assets).path }.toSet())
            assertEquals(saved.revision, repository.loadEidos(path).revision)
            assertTrue(
                runCatching {
                        repository.mutateWithAttachments(
                            empty,
                            null,
                            mapOf(label to "过期"),
                            field,
                            listOf(uri(first)),
                        )
                    }
                    .isFailure
            )
            assertEquals(before, assets.walkTopDown().map { it.relativeTo(assets).path }.toSet())
            assertEquals(1, repository.loadEidos(path).rows.size)
        } finally {
            repository.close()
            root.deleteRecursively()
            fixture.deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }
}
