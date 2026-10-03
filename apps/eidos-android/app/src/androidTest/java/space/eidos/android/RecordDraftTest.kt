package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class RecordDraftTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun reopensNewRecordDraftAfterModelRecreationAndClearsAfterCommit(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "record-draft-${UUID.randomUUID()}"
        val repo = SpaceRepository(app, id)
        val path = repo.create("", "记录", "eidos")
        val page = repo.loadEidos(path)
        val table = checkNotNull(page.table)
        val label = page.fields.first { it.id == table.labelFieldId }
        var model: EidosModel? = null
        fun reopen() {
            compose.runOnUiThread {
                model?.viewModelScope?.cancel()
                compose.activity.setContent {}
            }
            compose.waitForIdle()
            compose.runOnUiThread {
                val fresh = EidosModel(app, repo)
                model = fresh
                compose.activity.setContent { EidosApp(fresh) }
            }
            compose.waitUntil(15_000) {
                model?.state?.value?.spaceId == id && model?.state?.value?.busy == false
            }
            compose.onAllNodesWithText(path).onFirst().performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.page != null && model?.state?.value?.busy == false
            }
            compose.onNodeWithText("新增记录").performClick()
        }
        try {
            reopen()
            compose.waitUntil(15_000) {
                compose.onAllNodesWithText("正在读取草稿…").fetchSemanticsNodes().isEmpty()
            }
            compose.onNodeWithText(label.name).performTextInput("未提交的想法")
            compose.waitUntil(15_000) {
                compose.onAllNodesWithText("草稿已保存在本机；点击完成提交记录").fetchSemanticsNodes().isNotEmpty()
            }
            assertTrue(repo.loadEidos(path).rows.isEmpty())
            val stored = RecordDraftStore(app, id).load(path, table.id, null)
            assertEquals(page.revision, stored?.revision)
            compose.onNodeWithContentDescription("返回").performClick()
            compose.onNodeWithText("保留草稿并返回").performClick()
            reopen()
            compose.waitUntil(15_000) {
                compose
                    .onAllNodesWithText("未提交的想法", substring = true)
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }
            compose.onNodeWithText(label.name).assertTextContains("未提交的想法")
            compose.onNodeWithText("完成").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.page?.rows?.size == 1 && model?.state?.value?.busy == false
            }
            assertEquals("未提交的想法", repo.loadEidos(path).rows.single().values[label.id])
            assertNull(RecordDraftStore(app, id).load(path, table.id, null))
            compose.onNodeWithText("新增记录").performClick()
            compose.waitUntil(15_000) {
                compose.onAllNodesWithText("正在读取草稿…").fetchSemanticsNodes().isEmpty()
            }
            compose.onNodeWithText(label.name).performTextInput("将被放弃")
            compose.onNodeWithContentDescription("返回").performClick()
            compose.onNodeWithText("放弃修改").performClick()
            compose.waitUntil(15_000) {
                compose.onAllNodesWithText("离开记录编辑？").fetchSemanticsNodes().isEmpty()
            }
            assertNull(RecordDraftStore(app, id).load(path, table.id, null))
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            RecordDraftStore(app, id).clear(path, table.id, null)
            repo.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun keepsOriginalRevisionAndIsolatesSpacesAndRecords(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "record-revision-${UUID.randomUUID()}"
        val repo = SpaceRepository(app, id)
        val path = repo.create("", "记录", "eidos")
        val empty = repo.loadEidos(path)
        val table = checkNotNull(empty.table)
        repo.mutate(empty, null, mapOf(table.labelFieldId to "原始内容"))
        val page = repo.loadEidos(path)
        val row = page.rows.single()
        val changes = JSONObject().put(table.labelFieldId, "草稿内容").toString()
        val store = RecordDraftStore(app, id)
        try {
            store.save(path, table.id, row.id, RecordDraft(page.revision, changes))
            assertNull(RecordDraftStore(app, "$id-other").load(path, table.id, row.id))
            assertNull(store.load(path, table.id, null))
            repo.mutate(page, row, mapOf(table.labelFieldId to "后来修改"))
            val recovered = checkNotNull(RecordDraftStore(app, id).load(path, table.id, row.id))
            val current = repo.loadEidos(path)
            val result = runCatching {
                repo.mutate(
                    current.copy(revision = recovered.revision),
                    row,
                    mapOf(table.labelFieldId to "草稿内容"),
                )
            }
            assertTrue("Recovered drafts must retain stale revision checks", result.isFailure)
            assertEquals("后来修改", repo.loadEidos(path).rows.single().values[table.labelFieldId])
            assertEquals(recovered, store.load(path, table.id, row.id))
        } finally {
            store.clear(path, table.id, row.id)
            repo.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
