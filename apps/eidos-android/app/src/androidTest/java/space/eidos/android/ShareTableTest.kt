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

class ShareTableTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun choosesTableEditsSharedTextAndRemembersDestination(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "share-table-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val path = repository.create("", "分享资料", "eidos")
        val text = "分享的完整内容\nhttps://example.org/资料"
        var model: EidosModel? = null
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model!!) }
            }
            compose.waitUntil(15_000) { model?.state?.value?.busy == false }
            compose.runOnUiThread { model!!.receiveShare(emptyList(), text) }
            compose.waitUntil(15_000) {
                model!!.state.value.pendingShares.isNotEmpty() && !model!!.state.value.busy
            }
            compose.onNodeWithContentDescription("选择上级文件夹").performClick()
            compose.onNodeWithTag("share-folders").performScrollToNode(hasText("分享资料.eidos"))
            compose
                .onNode(hasText("分享资料.eidos") and hasAnyAncestor(hasTestTag("share-folders")))
                .performClick()
            compose.onNodeWithText("记录").performClick()
            compose.onNodeWithText(text).assertExists()
            assertTrue(repository.loadEidos(path).rows.isEmpty())
            compose.onNodeWithContentDescription("笔记").performTextInput("补充备注")
            compose.onNodeWithText("完成").performClick()
            compose.waitUntil(15_000) {
                model!!.state.value.pendingShares.isEmpty() && !model!!.state.value.busy
            }
            assertNull(model!!.state.value.error)
            val saved = repository.loadEidos(path)
            assertEquals(text, saved.rows.single().values[checkNotNull(saved.table).labelFieldId])
            val note = saved.fields.single { it.name == "笔记" }
            assertEquals("补充备注", saved.rows.single().values[note.id])
            val remembered = SpaceRepository(app, id).lastShareTable()
            assertEquals(path, remembered?.path)
            assertEquals(saved.table.id, remembered?.tableId)
            compose.runOnUiThread { model!!.receiveShare(emptyList(), "第二条分享") }
            compose.waitUntil(15_000) {
                model!!.state.value.pendingShares.isNotEmpty() && !model!!.state.value.busy
            }
            compose
                .onNode(hasText("记录") and hasAnyAncestor(hasTestTag("share-folders")))
                .performClick()
            compose.onNodeWithText("第二条分享").assertExists()
            compose.onNodeWithText("完成").performClick()
            compose.waitUntil(15_000) {
                model!!.state.value.pendingShares.isEmpty() && !model!!.state.value.busy
            }
            assertEquals(2, repository.loadEidos(path).rows.size)
            assertFalse(File(app.filesDir, "spaces/$id/收件箱").exists())
            // Returning from another share target must restore the original table's
            // native Runtime session, including a usable authenticated pagination cursor.
            val label = saved.table.labelFieldId
            NativeRuntime.call(
                File(app.filesDir, "spaces/$id/$path").path,
                "mutateRows",
                org.json
                    .JSONObject()
                    .put("tableId", saved.table.id)
                    .put("expectedRevision", repository.loadEidos(path).revision)
                    .put(
                        "changes",
                        org.json.JSONArray(
                            (1..53).map { index ->
                                org.json
                                    .JSONObject()
                                    .put("kind", "create")
                                    .put("clientKey", "fixture-$index")
                                    .put("values", org.json.JSONObject().put(label, "分页记录 $index"))
                            }
                        ),
                    ),
            )
            val other = repository.create("", "另一个文件", "eidos")
            val otherTable = checkNotNull(repository.loadEidos(other).table).id
            val file = repository.file(path)
            compose.runOnUiThread { model!!.open(file) }
            compose.waitUntil(15_000) {
                !model!!.state.value.busy && model!!.state.value.page?.rows?.size == 50
            }
            compose.runOnUiThread { model!!.receiveShare(emptyList(), "取消后保留分页") }
            compose.waitUntil(15_000) {
                !model!!.state.value.busy && model!!.state.value.pendingShares.isNotEmpty()
            }
            compose.runOnUiThread { model!!.openShareTable(other, otherTable) }
            compose.waitUntil(15_000) {
                !model!!.state.value.busy && model!!.state.value.shareRecord != null
            }
            compose.runOnUiThread { model!!.closeShareTable() }
            compose.waitUntil(15_000) {
                !model!!.state.value.busy && model!!.state.value.shareRecord == null
            }
            compose.runOnUiThread { model!!.cancelShare() }
            compose.waitUntil(15_000) {
                !model!!.state.value.busy && model!!.state.value.pendingShares.isEmpty()
            }
            compose.runOnUiThread { model!!.nextPage() }
            compose.waitUntil(15_000) {
                !model!!.state.value.busy &&
                    (model!!.state.value.page?.rows?.size == 55 ||
                        model!!.state.value.error != null)
            }
            assertNull(model!!.state.value.error)
            assertEquals(55, model!!.state.value.page?.rows?.size)
            assertTrue(repository.loadEidos(other).rows.isEmpty())
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            repository.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }
}
