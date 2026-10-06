package space.eidos.android

import androidx.core.content.FileProvider
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class EditorFileImportTest {
    @Test
    fun importsRelativeAssetsForMarkdownAndCanonicalEidosEntries(): Unit = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "editor-import-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val fixture = File(app.cacheDir, "test-share/$id").apply { mkdirs() }
        fun uri(file: File) = FileProvider.getUriForFile(app, "${app.packageName}.testshare", file)
        try {
            val folder = repository.create("", "Notes", "folder")
            val markdown = repository.create(folder, "Note", "markdown")
            val database = repository.create(folder, "Table", "eidos")
            val first =
                File(fixture, "a/图片 one.png").apply {
                    parentFile!!.mkdirs()
                    writeBytes(byteArrayOf(0, 1, 2, -1))
                }
            val second =
                File(fixture, "b/图片 one.png").apply {
                    parentFile!!.mkdirs()
                    writeBytes(byteArrayOf(9, 8, 7))
                }
            assertEquals(0, repository.importEditorFiles(markdown, emptyList()).length())
            assertFalse(File(root, "$folder/assets").exists())
            val entries = repository.importEditorFiles(markdown, listOf(uri(first), uri(second)))
            assertEquals(2, entries.length())
            for (index in 0..1) {
                val entry = entries.getJSONObject(index)
                assertTrue(entry.getString("uri").startsWith("assets/import-"))
                assertFalse(entry.getString("uri").contains(" "))
                val saved = File(root, markdownLocalPath(markdown, entry.getString("uri"))!!)
                assertArrayEquals(
                    if (index == 0) first.readBytes() else second.readBytes(),
                    saved.readBytes(),
                )
                assertEquals(saved.length().toString(), entry.getString("size"))
            }
            assertNotEquals(
                entries.getJSONObject(0).getString("uri"),
                entries.getJSONObject(1).getString("uri"),
            )
            val attachment =
                repository.importEditorFiles(database, listOf(uri(first))).getJSONObject(0)
            assertTrue(attachment.getString("id").isNotBlank())
            assertNotNull(repository.attachmentPreview(database, attachment))
            val before = File(root, "$folder/assets").list()!!.toSet()
            assertTrue(
                runCatching {
                        repository.importEditorFiles(
                            markdown,
                            listOf(uri(first), uri(File(fixture, "missing.png"))),
                        )
                    }
                    .isFailure
            )
            assertEquals(before, File(root, "$folder/assets").list()!!.toSet())
            assertTrue(
                runCatching {
                        repository.importEditorFiles(
                            markdown,
                            listOf(android.net.Uri.fromFile(first)),
                        )
                    }
                    .isFailure
            )
        } finally {
            repository.close()
            root.deleteRecursively()
            fixture.deleteRecursively()
        }
    }
}
