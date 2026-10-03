package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.content.FileProvider
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class AttachmentShareUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun sharesFileIntoSelectedFieldAndRemovesReferenceWithoutDeletingBytes(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "attachment-ui-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val fixture =
            File(app.cacheDir, "test-share/$id/报告.pdf").apply {
                parentFile!!.mkdirs()
                writeBytes(byteArrayOf(1, 2, 3, 4))
            }
        val uri = FileProvider.getUriForFile(app, "${app.packageName}.testshare", fixture)
        val path = "收集.eidos"
        NativeRuntime.call(
            File(root, path).path,
            "create",
            JSONObject()
                .put("title", "收集")
                .put(
                    "fields",
                    JSONArray()
                        .put(
                            JSONObject()
                                .put("clientKey", "title")
                                .put("name", "标题")
                                .put("kind", "text")
                                .put("position", "0")
                        )
                        .put(
                            JSONObject()
                                .put("clientKey", "files")
                                .put("name", "图片")
                                .put("kind", "file")
                                .put("position", "1")
                        )
                        .put(
                            JSONObject()
                                .put("clientKey", "reports")
                                .put("name", "报告")
                                .put("kind", "file")
                                .put("position", "2")
                        ),
                ),
        )
        val empty = repository.loadEidos(path)
        val table = checkNotNull(empty.table)
        repository.setFavorite(Favorite(path, "收集表", table.id), true)
        var model: EidosModel? = null
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model!!) }
            }
            compose.waitUntil(15_000) { model?.state?.value?.busy == false }
            compose.runOnUiThread { model!!.receiveShare(listOf(uri), "附带说明") }
            compose.waitUntil(15_000) {
                !model!!.state.value.busy && model!!.state.value.pendingShares.isNotEmpty()
            }
            compose
                .onNode(hasText("收集表") and hasAnyAncestor(hasTestTag("share-folders")))
                .performClick()
            compose.onNodeWithText("将 1 个分享附件保存到报告").performScrollTo().performClick()
            compose.onNodeWithText("附带说明").assertExists()
            compose
                .onNodeWithContentDescription("标题")
                .performScrollTo()
                .performTextReplacement("恢复后的说明")
            compose.waitUntil(15_000) {
                compose.onAllNodesWithText("草稿已保存在本机；点击完成提交记录").fetchSemanticsNodes().isNotEmpty()
            }
            assertFalse(File(root, "assets").exists())
            compose.runOnUiThread {
                model!!.viewModelScope.cancel()
                compose.activity.setContent {}
            }
            compose.waitForIdle()
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model!!) }
            }
            compose.waitUntil(15_000) {
                !model!!.state.value.busy && model!!.state.value.pendingShares.isNotEmpty()
            }
            compose.onNodeWithText("继续填写分享记录").performClick()
            compose.waitUntil(15_000) {
                compose
                    .onAllNodesWithText("恢复后的说明", substring = true)
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }
            compose.onNodeWithContentDescription("标题").assertTextContains("恢复后的说明")
            assertEquals(
                empty.fields.single { it.name == "报告" }.id,
                model!!.state.value.shareAttachmentFieldId,
            )
            compose.onNodeWithText("完成").performClick()
            compose.waitUntil(15_000) {
                !model!!.state.value.busy && model!!.state.value.pendingShares.isEmpty()
            }
            assertNull(model!!.state.value.error)
            val saved = repository.loadEidos(path)
            val reportField = saved.fields.single { it.name == "报告" }.id
            val photoField = saved.fields.single { it.name == "图片" }.id
            val row = saved.rows.single()
            val reports = row.values[reportField] as JSONArray
            assertEquals(1, reports.length())
            val unused = row.values[photoField]
            assertTrue(
                unused == null ||
                    unused == JSONObject.NULL ||
                    unused is JSONArray && unused.length() == 0
            )
            assertEquals("恢复后的说明", row.values[table.labelFieldId])
            val attachment =
                File(root, android.net.Uri.decode(reports.getJSONObject(0).getString("uri")))
            assertArrayEquals(fixture.readBytes(), attachment.readBytes())
            compose.onNodeWithText("恢复后的说明").performClick()
            compose.onNodeWithText("报告.pdf").performScrollTo().assertExists()
            compose.onNodeWithText("报告.pdf").performClick()
            compose.onNodeWithText("移除").performScrollTo().performClick()
            compose.onNodeWithText("完成附件编辑").performClick()
            compose.onNodeWithText("完成").performClick()
            compose.waitUntil(15_000) {
                !model!!.state.value.busy &&
                    (model!!.state.value.page?.rows?.singleOrNull()?.values?.get(reportField)
                            as? JSONArray)
                        ?.length() == 0
            }
            assertTrue(attachment.isFile)
            assertEquals(
                0,
                (repository.loadEidos(path).rows.single().values[reportField] as JSONArray).length(),
            )
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            repository.close()
            root.deleteRecursively()
            fixture.parentFile!!.deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }
}
