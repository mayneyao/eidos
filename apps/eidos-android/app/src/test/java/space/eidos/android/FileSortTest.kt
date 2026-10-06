package space.eidos.android

import org.junit.Assert.assertEquals
import org.junit.Test

class FileSortTest {
    private val files =
        listOf(
            SpaceFile("Note 10.md", "Note 10.md", false, 30, 0),
            SpaceFile("Folder", "Folder", true, 0, 0),
            SpaceFile("Note 2.md", "Note 2.md", false, 10, 0),
            SpaceFile("Alpha.eidos", "Alpha.eidos", false, 20, 0),
        )

    private fun names(sort: FileSort) = files.sortedWith(sort.comparator()).map { it.name }

    @Test
    fun namesUseNaturalOrderingAndKeepFoldersFirstInBothDirections() {
        assertEquals(listOf("Folder", "Alpha.eidos", "Note 2.md", "Note 10.md"), names(FileSort()))
        assertEquals(
            listOf("Folder", "Note 10.md", "Note 2.md", "Alpha.eidos"),
            names(FileSort(descending = true)),
        )
    }

    @Test
    fun modificationTimeAndTypeUseNameAsTieBreaker() {
        assertEquals(
            listOf("Folder", "Note 2.md", "Alpha.eidos", "Note 10.md"),
            names(FileSort("modified")),
        )
        assertEquals(
            listOf("Folder", "Note 10.md", "Alpha.eidos", "Note 2.md"),
            names(FileSort("modified", true)),
        )
        assertEquals(
            listOf("Folder", "Alpha.eidos", "Note 2.md", "Note 10.md"),
            names(FileSort("type")),
        )
        assertEquals(
            listOf("Folder", "Note 10.md", "Note 2.md", "Alpha.eidos"),
            names(FileSort("type", true)),
        )
    }
}
