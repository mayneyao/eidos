package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class FileBrowserSortTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun anchoredCreationUsesUniqueNamesAndOpensImmediately() = runBlocking {
        val app = compose.activity.application
        val id = "untitled-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        assertEquals("Untitled.md", repository.createUntitled("", "markdown"))
        assertEquals("Untitled 2.md", repository.createUntitled("", "markdown"))
        assertEquals("Untitled.eidos", repository.createUntitled("", "eidos"))
        assertEquals("Untitled 2.eidos", repository.createUntitled("", "eidos"))
        assertEquals("Untitled", repository.createUntitled("", "folder"))
        repository.setFavorite(Favorite("Untitled.md", "Untitled.md"), true)
        assertEquals("Named.md", repository.rename("Untitled.md", "Named.md"))
        assertEquals("Named.md", repository.favorites().first().path)
        assertEquals("", repository.readText("Named.md").text)
        assertTrue(runCatching { repository.rename("Named.md", "Untitled 2.md") }.isFailure)
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.onNodeWithContentDescription("新建").performClick()
            compose.onNodeWithText("名称").assertDoesNotExist()
            compose.onNodeWithText("新建文件夹").performClick()
            compose.waitUntil(5000) {
                model.state.value.folder == "Untitled 2" && !model.state.value.busy
            }
            compose.onNodeWithContentDescription("新建").performClick()
            compose.onNodeWithText("新建笔记").performClick()
            compose.waitUntil(15000) {
                !model.state.value.busy &&
                    (model.state.value.webFile?.path == "Untitled 2/Untitled.md")
            }
            assertEquals("", repository.readText("Untitled 2/Untitled.md").text)
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            repository.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun favoritesKeepFileMenusAndFolderNavigation() = runBlocking {
        val app = compose.activity.application
        val id = "favorite-row-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        repository.create("", "Note", "markdown")
        repository.create("", "Folder", "folder")
        repository.setFavorite(Favorite("Note.md", "Note.md"), true)
        repository.setFavorite(Favorite("Folder", "Folder"), true)
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) {
                !model.state.value.busy && model.state.value.favoriteFiles.size == 2
            }
            assertTrue(model.state.value.favoriteFiles.getValue("Folder").directory)
            compose.onAllNodesWithText("资料").assertCountEquals(1)
            compose.onNodeWithContentDescription("取消收藏 Note.md").assertDoesNotExist()
            compose.onAllNodesWithContentDescription("更多 Note.md")[0].performClick()
            compose.onNodeWithText("导出").assertIsDisplayed()
            compose.onNodeWithText("取消收藏").performClick()
            compose.waitUntil(5000) { model.state.value.favorites.none { it.path == "Note.md" } }
            assertTrue(repository.file("Note.md").markdown)
            compose.onAllNodesWithText("Folder")[0].performClick()
            compose.waitUntil(5000) {
                model.state.value.folder == "Folder" && !model.state.value.busy
            }
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            repository.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun topBarCreationAndPersistentSort() = runBlocking {
        val app = compose.activity.application
        val id = "sort-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        repository.create("", "Note 10", "markdown")
        repository.create("", "Note 2", "markdown")
        lateinit var model: EidosModel
        var original = FileSort()
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                original = model.state.value.fileSort
                model.sortFiles(FileSort())
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            val search =
                compose.onNodeWithContentDescription("搜索").fetchSemanticsNode().boundsInRoot
            val create =
                compose.onNodeWithContentDescription("新建").fetchSemanticsNode().boundsInRoot
            assertEquals(search.top, create.top, 1f)
            assertTrue(create.left >= search.right)
            assertTrue(
                compose.onNodeWithText("Note 2.md").fetchSemanticsNode().boundsInRoot.top <
                    compose.onNodeWithText("Note 10.md").fetchSemanticsNode().boundsInRoot.top
            )
            compose.onNodeWithContentDescription("当前文件夹操作").performClick()
            compose.onNodeWithText("排序").performClick()
            compose.onNodeWithText("降序").performClick()
            assertEquals(FileSort(descending = true), model.state.value.fileSort)
            compose.runOnUiThread {
                val restored = EidosModel(app, repository)
                assertEquals(FileSort(descending = true), restored.state.value.fileSort)
                restored.viewModelScope.cancel()
            }
        } finally {
            compose.runOnUiThread {
                model.sortFiles(original)
                compose.activity.setContent {}
                model.viewModelScope.cancel()
            }
            repository.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
