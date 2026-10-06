package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class GlobalSearchTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun searchesRecordContentsWithoutWritingAndOpensMatchingTable(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "global-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val path = repository.create("", "资料", "eidos")
        val page = repository.loadEidos(path)
        val label = checkNotNull(page.table).labelFieldId
        val notes = page.fields.first { it.name == "笔记" }.id
        repository.mutate(page, null, mapOf(label to "原生搜索结果", notes to "needle-远足资料"))
        val markdown = repository.create("", "手记", "markdown")
        repository.saveText(repository.readText(markdown).copy(text = "needle-路线规划"))
        val root = File(app.filesDir, "spaces/$id")
        File(root, "broken.eidos").writeText("not SQLite")
        val before = File(root, path).readBytes()
        var model: EidosModel? = null
        try {
            val results = repository.search("needle")
            assertEquals(setOf(path, markdown), results.matches.map { it.file.path }.toSet())
            assertEquals(listOf("broken.eidos"), results.skipped)
            assertEquals("原生搜索结果", results.matches.first { it.tableId != null }.preview)
            assertArrayEquals(before, File(root, path).readBytes())
            compose.runOnUiThread {
                val isolated = EidosModel(app, repository)
                model = isolated
                compose.activity.setContent { EidosApp(isolated) }
            }
            compose.waitUntil(15_000) { model?.state?.value?.busy == false }
            compose.onNodeWithContentDescription("搜索").performClick()
            compose
                .onNodeWithTag("global-search-sheet")
                .assertIsDisplayed()
                .assertHeightIsAtLeast(200.dp)
            assertEquals(MainTab.Files, model!!.state.value.tab)
            compose.onNodeWithText("搜索文件、Markdown 和数据记录").performTextInput("needle")
            compose.waitUntil(60_000) { model?.state?.value?.searching == false }
            assertEquals("needle", model!!.state.value.search)
            assertNull(model!!.state.value.error)
            assertEquals(2, model!!.state.value.matches.size)
            compose.onNodeWithText("原生搜索结果").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.webQuery == "needle" && model?.state?.value?.busy == false
            }
            assertEquals(page.table.id, model!!.state.value.webTableId)
            assertEquals("needle", model!!.state.value.webQuery)
            compose.onNodeWithContentDescription("返回文件").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.webFile == null && model?.state?.value?.busy == false
            }
            compose.onNodeWithText("搜索文件、Markdown 和数据记录").assertDoesNotExist()
            compose.onNodeWithContentDescription("搜索").performClick()
            compose.onNodeWithText("needle").assertExists()
            compose
                .onNode(hasText("手记.md") and hasAnyAncestor(hasTestTag("global-search-sheet")))
                .performTouchInput { longClick() }
            compose
                .onNodeWithTag("file-actions-sheet")
                .assertIsDisplayed()
                .assertHeightIsAtLeast(200.dp)
            compose
                .onNode(hasText("收藏") and hasAnyAncestor(hasTestTag("file-actions-sheet")))
                .performClick()
            compose.onNodeWithTag("file-actions-sheet").assertDoesNotExist()
            compose.onNodeWithText("needle").assertExists()
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            root.deleteRecursively()
        }
    }
}
