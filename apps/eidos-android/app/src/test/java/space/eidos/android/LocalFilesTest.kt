package space.eidos.android

import java.io.File
import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class LocalFilesTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun rejectsTraversalAndSymlinkEscape() {
        val root = temporary.newFolder("space")
        val outside = temporary.newFolder("outside")
        val files = LocalFiles(root)
        assertThrows(IllegalArgumentException::class.java) { files.resolve("../outside/note.md") }
        assertThrows(IllegalArgumentException::class.java) { files.resolve(".graft/config") }
        Files.createSymbolicLink(File(root, "escape").toPath(), outside.toPath())
        assertThrows(IllegalArgumentException::class.java) { files.resolve("escape/note.md") }
    }

    @Test
    fun staleWritePreservesNewerContent() {
        val files = LocalFiles(temporary.newFolder("space"))
        val digest = files.writeText("笔记.md", "原始内容")
        files.writeText("笔记.md", "另一端的修改", digest)
        assertThrows(IllegalStateException::class.java) { files.writeText("笔记.md", "过期编辑", digest) }
        assertEquals("另一端的修改", files.readText("笔记.md").first)
    }

    @Test
    fun insufficientSpacePreservesOriginalAndCanRetryAfterSpaceIsFreed() {
        val root = temporary.newFolder("low-space")
        val staging = temporary.newFolder("staging")
        var available = Long.MAX_VALUE
        val files = LocalFiles(root, staging, StorageSpace { available })
        val digest = files.writeText("note.md", "original")
        available = StorageSpace.RESERVE
        val error =
            assertThrows(java.io.IOException::class.java) {
                files.writeText("note.md", "replacement", digest)
            }
        assertTrue(error.message!!.contains("空间不足"))
        assertEquals("original", files.readText("note.md").first)
        assertTrue(staging.list()!!.isEmpty())
        available = Long.MAX_VALUE
        files.writeText("note.md", "replacement", digest)
        assertEquals("replacement", files.readText("note.md").first)
    }

    @Test
    fun preservesUtf8BytesAndRefusesSilentReplacement() {
        val root = temporary.newFolder("space")
        val files = LocalFiles(root)
        val text = "\uFEFF# 离线记录 🌱\r\n\r\n- [ ] 明天继续\r\n"
        files.writeText("note.md", text)
        val (read, digest) = files.readText("note.md")
        files.writeText("note.md", read, digest)
        assertArrayEquals(text.toByteArray(), File(root, "note.md").readBytes())
        assertThrows(IllegalStateException::class.java) { files.writeText("note.md", "overwrite") }
        File(root, "invalid.md").writeBytes(byteArrayOf(0xC3.toByte(), 0x28))
        assertThrows(java.nio.charset.CharacterCodingException::class.java) {
            files.readText("invalid.md")
        }
    }
}
