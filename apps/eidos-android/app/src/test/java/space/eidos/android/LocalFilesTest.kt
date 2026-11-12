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
    fun movesBytesAndNestedFoldersWithoutOverwriting() {
        val root = temporary.newFolder("moves")
        val files = LocalFiles(root)
        File(root, "A/assets").mkdirs()
        File(root, "B").mkdir()
        val bytes = byteArrayOf(0, 1, 0xFF.toByte(), 2)
        File(root, "A/data.bin").writeBytes(bytes)
        assertEquals(File(root, "B/data.bin").canonicalFile, files.move("A/data.bin", "B"))
        assertFalse(File(root, "A/data.bin").exists())
        assertArrayEquals(bytes, File(root, "B/data.bin").readBytes())
        files.move("B/data.bin", "B") // Same-folder no-op.
        File(root, "A/data.bin").writeText("collision")
        assertThrows(IllegalStateException::class.java) { files.move("B/data.bin", "A") }
        assertArrayEquals(bytes, File(root, "B/data.bin").readBytes())
        assertEquals("collision", File(root, "A/data.bin").readText())
        files.move("B/data.bin", "")
        File(root, "A/assets/image.png").writeBytes(bytes)
        File(root, "A/note.md").writeText("![image](assets/image.png)")
        files.move("A", "B")
        assertArrayEquals(bytes, File(root, "B/A/assets/image.png").readBytes())
        assertEquals("![image](assets/image.png)", File(root, "B/A/note.md").readText())
    }

    @Test
    fun moveRejectsCyclesRootTraversalAndSymlinks() {
        val root = temporary.newFolder("unsafe-moves")
        val files = LocalFiles(root)
        File(root, "A/child").mkdirs()
        File(root, "A/note.md").writeText("safe")
        File(root, "target").mkdir()
        File(root, ".internal").mkdir()
        listOf("A", "A/child").forEach { folder ->
            assertThrows(IllegalArgumentException::class.java) { files.move("A", folder) }
        }
        assertThrows(IllegalArgumentException::class.java) { files.move("", "target") }
        listOf("../escape", "/tmp", "A/../target", ".internal", "A/./child", "A\\child").forEach { folder ->
            assertThrows(IllegalArgumentException::class.java) { files.move("A/note.md", folder) }
        }
        Files.createSymbolicLink(File(root, "link").toPath(), File(root, "A").toPath())
        assertThrows(IllegalArgumentException::class.java) { files.move("link/note.md", "target") }
        assertThrows(IllegalArgumentException::class.java) { files.move("A/note.md", "link/child") }
        Files.createSymbolicLink(File(root, "target/note.md").toPath(), File(root, "missing").toPath())
        assertThrows(IllegalArgumentException::class.java) { files.move("A/note.md", "target") }
        Files.createSymbolicLink(File(root, "A/child/loop").toPath(), File(root, "A").toPath())
        assertThrows(IllegalArgumentException::class.java) { files.move("A", "target") }
        assertEquals("safe", File(root, "A/note.md").readText())
    }

    @Test
    fun trashMovesOnlyTheSelectedFileAndPreservesItsBytes() {
        val root = temporary.newFolder("space")
        val trash = temporary.newFolder("trash")
        val files = LocalFiles(root)
        File(root, "selected.md").writeText("selected")
        File(root, "other.md").writeText("other")
        files.trash("selected.md", trash)
        assertFalse(File(root, "selected.md").exists())
        assertEquals("other", File(root, "other.md").readText())
        val removed = trash.listFiles()!!.single()
        assertEquals("selected", File(removed, "payload").readText())
        assertEquals("selected.md", File(removed, "path").readText())
        assertThrows(IllegalArgumentException::class.java) { files.trash("", trash) }
        assertThrows(IllegalArgumentException::class.java) { files.trash("../outside", trash) }
        Files.createSymbolicLink(File(root, "link.md").toPath(), File(root, "other.md").toPath())
        assertThrows(IllegalArgumentException::class.java) { files.trash("link.md", trash) }
        assertEquals("other", File(root, "other.md").readText())
    }

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
