package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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
            compose.onNodeWithText("搜索").performClick()
            compose.onNodeWithText("搜索文件、Markdown 和数据记录").performTextInput("needle")
            compose.waitUntil(15_000) {
                model?.state?.value?.searching == false && model?.state?.value?.matches?.size == 2
            }
            compose.onNodeWithText("原生搜索结果").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.page?.query == "needle" && model?.state?.value?.busy == false
            }
            assertEquals(page.table.id, model!!.state.value.page?.table?.id)
            assertEquals("原生搜索结果", model!!.state.value.page!!.rows.single().values[label])
            compose.onNodeWithContentDescription("返回").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.page == null && model?.state?.value?.busy == false
            }
            compose.onNodeWithText("needle").assertExists()
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            root.deleteRecursively()
        }
    }
}
