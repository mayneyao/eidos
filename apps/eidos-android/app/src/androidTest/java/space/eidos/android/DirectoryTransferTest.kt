package space.eidos.android

import android.provider.DocumentsContract
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class DirectoryTransferTest {
    @Test
    fun lowSpaceMidImportDiscardsPartialTreeAndAllowsRetry(): Unit = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "low-space-${UUID.randomUUID()}"
        var checks = 0
        var low = true
        val repo =
            SpaceRepository(
                app,
                id,
                StorageSpace { if (low && ++checks > 1) 0 else Long.MAX_VALUE },
            )
        val root = File(app.filesDir, "spaces/$id")
        val fixture = File(app.cacheDir, "test-tree/$id/source").apply { mkdirs() }
        val bytes = ByteArray(200_000) { (it % 251).toByte() }
        File(fixture, "large.bin").writeBytes(bytes)
        val uri =
            DocumentsContract.buildTreeDocumentUri("${app.packageName}.testtree", "$id/source")
        try {
            val preserved = repo.create("", "existing", "markdown")
            val before = File(root, preserved).readBytes()
            checks = 0
            val error = runCatching { repo.importDirectory(uri, "") }.exceptionOrNull()
            assertTrue(error?.message?.contains("空间不足") == true)
            assertTrue(checks > 1) // At least one chunk reached disk before failure.
            assertFalse(File(root, "source").exists())
            assertTrue(File(app.filesDir, "staging/$id").list()!!.isEmpty())
            assertArrayEquals(before, File(root, preserved).readBytes())
            low = false
            assertEquals("source", repo.importDirectory(uri, ""))
            assertArrayEquals(bytes, File(root, "source/large.bin").readBytes())
            val document = repo.readText(preserved)
            repo.saveDraft(document.copy(text = "recoverable draft"))
            low = true
            assertTrue(
                runCatching { repo.saveText(document.copy(text = "recoverable draft")) }.isFailure
            )
            assertArrayEquals(before, File(root, preserved).readBytes())
            assertEquals("recoverable draft", repo.readText(preserved).text)
        } finally {
            repo.close()
            root.deleteRecursively()
            fixture.parentFile!!.deleteRecursively()
        }
    }

    @Test
    fun roundtripsCompleteDirectoryAndCleansFailedCopies(): Unit = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "tree-${UUID.randomUUID()}"
        val repo = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val fixture = File(app.cacheDir, "test-tree/$id").apply { mkdirs() }
        fun tree(path: String) =
            DocumentsContract.buildTreeDocumentUri("${app.packageName}.testtree", "$id/$path")
        try {
            val source = File(fixture, "资料").apply { mkdirs() }
            File(source, "笔记.md").writeText("![照片](assets/photo.bin)")
            File(source, "assets").mkdir()
            val bytes = byteArrayOf(0, 1, -1, 8)
            File(source, "assets/photo.bin").writeBytes(bytes)
            File(source, "empty").mkdir()
            File(source, ".graft").mkdir()
            val imported = repo.importDirectory(tree("资料"), "")
            assertEquals("资料", imported)
            assertArrayEquals(bytes, File(root, "资料/assets/photo.bin").readBytes())
            assertTrue(File(root, "资料/empty").isDirectory)
            assertFalse(File(root, "资料/.graft").exists())
            assertEquals("资料 (2)", repo.importDirectory(tree("资料"), ""))
            val database = repo.create(imported, "数据", "eidos")
            val page = repo.loadEidos(database)
            val label = page.table!!.labelFieldId
            repo.mutate(page, null, mapOf(label to "目录导出记录"))
            repo.loadEidos(database) // Keep a real Runtime query session open before exporting.
            val output = File(fixture, "out").apply { mkdirs() }
            repo.exportDirectory(imported, tree("out"))
            assertArrayEquals(bytes, File(output, "资料/assets/photo.bin").readBytes())
            val back = repo.importDirectory(tree("out/资料"), "")
            assertEquals("目录导出记录", repo.loadEidos("$back/数据.eidos").rows.single().values[label])
            File(source, "fail.bin").writeBytes(bytes)
            val before = root.list()!!.toSet()
            assertTrue(runCatching { repo.importDirectory(tree("资料"), "") }.isFailure)
            assertEquals(before, root.list()!!.toSet())
            File(root, "$imported/fail.bin").writeBytes(bytes)
            val previousExports = output.list()!!.toSet()
            assertTrue(runCatching { repo.exportDirectory(imported, tree("out")) }.isFailure)
            assertEquals(previousExports, output.list()!!.toSet())
            assertArrayEquals(bytes, File(output, "资料/assets/photo.bin").readBytes())
            File(root, "$imported/fail.bin").delete()
            File(root, "$imported/rename.bin").writeBytes(bytes)
            val renamed =
                runCatching { repo.exportDirectory(imported, tree("out")) }.exceptionOrNull()
            assertTrue(renamed?.message?.contains("更改了文件名") == true)
            assertEquals(previousExports, output.list()!!.toSet())
        } finally {
            repo.close()
            root.deleteRecursively()
            fixture.deleteRecursively()
        }
    }
}
