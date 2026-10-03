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

class SavedViewTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun opensComplexSavedQueryPagesItAndSavesNativeView(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "views-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val path = repository.create("", "资料", "eidos")
        val root = File(app.filesDir, "spaces/$id")
        val file = File(root, path)
        val empty = repository.loadEidos(path)
        val table = checkNotNull(empty.table)
        val title = table.labelFieldId
        val notes = empty.fields.first { it.name == "笔记" }.id
        val seeded =
            NativeRuntime.call(
                file.path,
                "mutateRows",
                JSONObject()
                    .put("tableId", table.id)
                    .put("expectedRevision", empty.revision)
                    .put(
                        "changes",
                        JSONArray(
                            (0..79).map { index ->
                                JSONObject()
                                    .put("kind", "create")
                                    .put("clientKey", "row-$index")
                                    .put(
                                        "values",
                                        JSONObject()
                                            .put(title, "Item ${index.toString().padStart(2, '0')}")
                                            .put(
                                                notes,
                                                if (index % 4 == 0) JSONObject.NULL else "keep",
                                            ),
                                    )
                            }
                        ),
                    ),
            )
        val query =
            JSONObject()
                .put(
                    "filter",
                    JSONObject()
                        .put("op", "or")
                        .put(
                            "args",
                            JSONArray()
                                .put(
                                    JSONObject()
                                        .put("op", "eq")
                                        .put("fieldId", notes)
                                        .put("value", "keep")
                                )
                                .put(
                                    JSONObject()
                                        .put("op", "eq")
                                        .put("fieldId", title)
                                        .put("value", "Item 00")
                                ),
                        ),
                )
                .put(
                    "sort",
                    JSONArray()
                        .put(
                            JSONObject()
                                .put("fieldId", notes)
                                .put("direction", "asc")
                                .put("nulls", "first")
                        )
                        .put(
                            JSONObject()
                                .put("fieldId", title)
                                .put("direction", "desc")
                                .put("nulls", "last")
                        ),
                )
        val created =
            NativeRuntime.call(
                file.path,
                "mutateView",
                JSONObject()
                    .put("expectedRevision", seeded.getString("revision"))
                    .put(
                        "changes",
                        JSONArray()
                            .put(
                                JSONObject()
                                    .put("kind", "create-view")
                                    .put("clientKey", "desktop")
                                    .put("tableId", table.id)
                                    .put("name", "桌面视图")
                                    .put("type", "grid")
                                    .put("position", "0")
                                    .put("query", query)
                                    .put(
                                        "layout",
                                        JSONObject()
                                            .put("fieldOrder", JSONArray(listOf(notes, title)))
                                            .put("hiddenFields", JSONArray()),
                                    )
                            ),
                    ),
            )
        val viewId = created.getJSONArray("createdViews").getJSONObject(0).getString("viewId")
        var model: EidosModel? = null
        try {
            val first = repository.loadEidos(path, viewId = viewId)
            assertEquals("Item 00", first.rows.first().values[title])
            assertEquals("Item 79", first.rows[1].values[title])
            val next = repository.loadEidos(path, cursor = first.nextCursor, viewId = viewId)
            assertEquals(61, first.rows.size + next.rows.size)
            assertEquals(listOf(notes), viewFields(first))
            assertTrue(runCatching { repository.loadEidos(path, viewId = "missing") }.isFailure)
            compose.runOnUiThread {
                val isolated = EidosModel(app, repository)
                model = isolated
                compose.activity.setContent { EidosApp(isolated) }
            }
            compose.waitUntil(15_000) { model?.state?.value?.busy == false }
            val item = repository.file(path)
            compose.runOnUiThread { model!!.open(item) }
            compose.waitUntil(15_000) {
                model?.state?.value?.page != null && model?.state?.value?.busy == false
            }
            compose.onNodeWithText("全部记录").performClick()
            compose.onNodeWithText("桌面视图").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.page?.view?.id == viewId &&
                    model?.state?.value?.rowLoading == false
            }
            compose.runOnUiThread {
                model!!.filterRows("", listOf(EidosFilter(title, "contains", "7")))
            }
            compose.waitUntil(15_000) {
                model?.state?.value?.page?.filters?.isNotEmpty() == true &&
                    model?.state?.value?.rowLoading == false
            }
            compose.onNodeWithText("桌面视图").performClick()
            compose.onNodeWithText("保存为视图").performClick()
            compose.onNodeWithText("视图名称").performTextInput("手机视图")
            compose.onNodeWithText("保存视图").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.page?.view?.name == "手机视图" &&
                    model?.state?.value?.busy == false
            }
            val saved = model!!.state.value.page!!
            assertEquals("Item 79", saved.rows.first().values[title])
            assertTrue(saved.rows.all { it.values[title].toString().contains("7") })
            val reopened = SpaceRepository(app, id).loadEidos(path, viewId = saved.view!!.id)
            assertEquals(saved.rows.map { it.id }, reopened.rows.map { it.id })
            assertEquals(2, JSONObject(reopened.view!!.query).getJSONArray("sort").length())
            assertTrue(runCatching { repository.saveView(empty, "过期视图", emptyList()) }.isFailure)
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            root.deleteRecursively()
        }
    }
}
