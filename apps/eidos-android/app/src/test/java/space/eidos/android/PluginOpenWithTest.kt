package space.eidos.android

import org.junit.Assert.*
import org.junit.Test

class PluginOpenWithTest {
    private val view =
        PluginFileView("local.text/main", "Text", "local.text.main.js", setOf(".txt", ".md"))
    private val registry = PluginOpenWithRegistry(listOf(view))

    private fun file(path: String, directory: Boolean = false) =
        SpaceFile(path, path.substringAfterLast('/'), directory, 0, 0)

    @Test
    fun matchesCaseInsensitiveExtensionsWithoutTreatingFoldersAsFiles() {
        assertEquals(listOf(view), registry.candidates(file("notes/A.TXT")))
        assertTrue(registry.candidates(file("notes.txt", true)).isEmpty())
        assertTrue(registry.candidates(file("data.eidos")).isEmpty())
        assertTrue(registry.candidates(file("notes.txt.exe")).isEmpty())
        assertEquals(view, registry.resolve(file("notes.md"), view.id))
    }

    @Test
    fun installedFileViewsCanOpenEidosFiles() {
        val databaseView = view.copy(
            id = "local.database/main", extensions = setOf(".eidos"),
            document = false, revision = "verified-package",
        )
        val installed = PluginOpenWithRegistry(listOf(databaseView))
        assertEquals(listOf(databaseView), installed.candidates(file("books.EIDOS")))
        assertTrue(installed.candidates(file("notes.md")).isEmpty())
        assertTrue(installed.candidates(file("folder.eidos", true)).isEmpty())
    }

    @Test
    fun rejectsStaleSelectionsAndEscapingPaths() {
        for (path in listOf("../a.txt", "/a.txt", "a/../b.txt", "a\\b.txt", "a//b.txt")) assertTrue(
            registry.candidates(file(path)).isEmpty()
        )
        assertThrows(IllegalStateException::class.java) {
            registry.resolve(file("a.json"), view.id)
        }
        assertThrows(IllegalStateException::class.java) {
            registry.resolve(file("a.txt"), "unknown")
        }
    }

    @Test
    fun rejectsDuplicateRegistrationsAndUntrustedAssets() {
        assertThrows(IllegalArgumentException::class.java) {
            PluginOpenWithRegistry(listOf(view, view))
        }
        assertThrows(IllegalArgumentException::class.java) {
            PluginOpenWithRegistry(listOf(view.copy(asset = "../main.js")))
        }
        assertThrows(IllegalArgumentException::class.java) {
            PluginOpenWithRegistry(listOf(view.copy(extensions = setOf(".eidos"))))
        }
    }
}
