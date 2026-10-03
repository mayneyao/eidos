package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class RecordQueryTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun sortedPagesSearchAndNativeFieldControls() = runBlocking {
        val app = compose.activity.application
        val id = "query-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val path = repository.create("", "查询", "eidos")
        val empty = repository.loadEidos(path)
        val title = checkNotNull(empty.table).labelFieldId
        val notes = empty.fields.first { it.name == "笔记" }.id
        NativeRuntime.call(
            File(app.filesDir, "spaces/$id/$path").path,
            "mutateRows",
            JSONObject()
                .put("tableId", empty.table.id)
                .put("expectedRevision", empty.revision)
                .put(
                    "changes",
                    JSONArray(
                        (0..54).reversed().map { index ->
                            JSONObject()
                                .put("kind", "create")
                                .put("clientKey", "row-$index")
                                .put(
                                    "values",
                                    JSONObject()
                                        .put(title, "Item ${index.toString().padStart(2, '0')}")
                                        .put(notes, "摘要"),
                                )
                        }
                    ),
                ),
        )
        var model: EidosModel? = null
        try {
            val first = repository.loadEidos(path, sort = EidosSort(title))
            assertEquals("Item 00", first.rows.first().values[title])
            assertEquals("Item 49", first.rows.last().values[title])
            val second = repository.loadEidos(path, cursor = first.nextCursor, sort = first.sort)
            assertEquals((50..54).map { "Item $it" }, second.rows.map { it.values[title] })
            val descending =
                repository.loadEidos(path, query = "Item 0", sort = EidosSort(title, true))
            assertEquals("Item 09", descending.rows.first().values[title])
            val filters =
                listOf(EidosFilter(title, "gt", "Item 00"), EidosFilter(notes, "is-not-null"))
            val filtered =
                repository.loadEidos(
                    path,
                    query = "Item",
                    sort = EidosSort(title),
                    filters = filters,
                )
            assertEquals("Item 01", filtered.rows.first().values[title])
            val rest =
                repository.loadEidos(
                    path,
                    query = "Item",
                    cursor = filtered.nextCursor,
                    sort = filtered.sort,
                    filters = filters,
                )
            assertEquals((51..54).map { "Item $it" }, rest.rows.map { it.values[title] })
            compose.runOnUiThread {
                val isolated = EidosModel(app, repository)
                model = isolated
                compose.activity.setContent { EidosApp(isolated) }
            }
            compose.waitUntil(15_000) { model?.state?.value?.busy == false }
            val file = repository.file(path)
            compose.runOnUiThread { model!!.open(file) }
            compose.waitUntil(15_000) {
                model?.state?.value?.page != null && model?.state?.value?.busy == false
            }
            compose.onNodeWithContentDescription("排序").performClick()
            compose.onAllNodesWithText("升序").onFirst().performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.page?.sort == EidosSort(title) &&
                    model?.state?.value?.rowLoading == false
            }
            compose.onNodeWithContentDescription("字段（1）").performClick()
            compose.onNodeWithText("笔记").performClick()
            compose.onNodeWithText("完成").performClick()
            compose.onAllNodesWithText("笔记：摘要").assertCountEquals(0)
            assertEquals(
                emptyList<String>(),
                SpaceRepository(app, id).displayedFields(path, empty.table.id),
            )
            // Clear sort and change search before the debounce runs: null is a real reset.
            compose.runOnUiThread {
                model!!.sortRows("", null)
                model!!.queryRows("Item 0")
            }
            compose.waitUntil(15_000) {
                model?.state?.value?.page?.query == "Item 0" &&
                    model?.state?.value?.rowLoading == false
            }
            assertNull(model!!.state.value.page?.sort)
            assertEquals(10, model!!.state.value.page?.rows?.size)
            compose.onNodeWithContentDescription("筛选（0）").performClick()
            compose.onNodeWithText("添加条件").performClick()
            compose.onNodeWithText("不为空").performClick()
            compose.onNodeWithText("包含").performClick()
            compose.onNodeWithText("比较值").performTextInput("Item 01")
            compose.onNodeWithText("应用筛选").performScrollTo().performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.page?.filters?.isNotEmpty() == true &&
                    model?.state?.value?.rowLoading == false
            }
            assertEquals("Item 01", model!!.state.value.page!!.rows.single().values[title])
            // An edit that stops matching the filter must disappear after refresh.
            compose.runOnUiThread {
                model!!.mutate(
                    model!!.state.value.page!!.rows.single(),
                    mapOf(title to "Edited"),
                    done = {},
                )
            }
            compose.waitUntil(15_000) {
                model?.state?.value?.busy == false &&
                    model?.state?.value?.page?.rows?.isEmpty() == true
            }
            assertEquals(1, model!!.state.value.page!!.filters.size)
            compose.runOnUiThread {
                model!!.filterRows("", emptyList())
                model!!.sortRows("", EidosSort(title))
                model!!.queryRows("Edited")
            }
            compose.waitUntil(15_000) {
                model?.state?.value?.page?.query == "Edited" &&
                    model?.state?.value?.rowLoading == false
            }
            assertTrue(model!!.state.value.page!!.filters.isEmpty())
            assertEquals("Edited", model!!.state.value.page!!.rows.single().values[title])
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
