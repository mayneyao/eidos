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

class RelationDisplayTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun resolvesLabelsInListAndEditorWithoutChangingStoredIds(): Unit = runBlocking {
        val app = compose.activity.application
        val editorPreferences = app.getSharedPreferences("editor", 0)
        val previousWebEditor = editorPreferences.getBoolean("web", true)
        editorPreferences.edit().putBoolean("web", false).commit()
        val id = "relation-${UUID.randomUUID()}"
        val repo = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        var model: EidosModel? = null
        try {
            val path = "关联测试.eidos"
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                .context
                .assets
                .open("relation-labels.eidos")
                .use { input -> File(root, path).outputStream().use { input.copyTo(it) } }
            var page = repo.loadEidos(path)
            val table = checkNotNull(page.table)
            val label = table.labelFieldId
            val target = page.rows.single { it.values[label] == "目标标题" }.id
            val relation = page.fields.single { it.kind == "relation" }
            repo.setDisplayedFields(path, table.id, listOf(relation.id))
            page = repo.loadEidos(path)
            val source = page.rows.single { it.values[label] == "来源记录" }
            assertEquals("目标标题", source.fieldDisplay(relation))
            assertEquals(target, (source.values[relation.id] as JSONArray).getString(0))
            assertEquals("未关联记录", relationDisplay(JSONArray(), emptyMap()))
            assertEquals("关联记录不可用", relationDisplay(JSONArray().put("missing"), emptyMap()))
            val fallback =
                parseRelationLabels(
                    JSONArray().put(JSONObject().put("fieldId", relation.id)),
                    JSONObject(
                        """{"resolvedRelations":[{"column":0,"items":[{"id":"blank","state":"resolved","label":null},{"id":"missing","state":"unresolved"}]}]}"""
                    ),
                )
            assertEquals(
                "未命名记录、关联记录不可用",
                relationDisplay(JSONArray().put("blank").put("missing"), fallback[relation.id]),
            )
            compose.runOnUiThread {
                model = EidosModel(app, repo)
                compose.activity.setContent { EidosApp(model!!) }
            }
            compose.waitUntil(15000) { model?.state?.value?.busy == false }
            val file = repo.file(path)
            compose.runOnUiThread { model!!.open(file) }
            compose.waitUntil(15000) {
                model?.state?.value?.page != null && model?.state?.value?.busy == false
            }
            compose.onNodeWithText("关联：目标标题").assertIsDisplayed()
            compose.onNodeWithText("来源记录").performClick()
            compose.onNodeWithText("目标标题").assertIsDisplayed()
            val labelName = page.fields.single { it.id == label }.name
            compose.onNodeWithContentDescription(labelName).performTextReplacement("修改后的来源")
            compose.onNodeWithText("完成").performClick()
            compose.waitUntil(15000) {
                model?.state?.value?.page?.rows?.any { it.values[label] == "修改后的来源" } == true &&
                    model?.state?.value?.busy == false
            }
            val saved = repo.loadEidos(path).rows.single { it.id == source.id }
            assertEquals(target, (saved.values[relation.id] as JSONArray).getString(0))
            assertEquals("目标标题", saved.fieldDisplay(relation))
        } finally {
            editorPreferences.edit().putBoolean("web", previousWebEditor).commit()
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            repo.close()
            root.deleteRecursively()
        }
    }
}
