package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** End-to-end visual evidence for the four screens in Android design 01. */
class DesignJourneyTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun reviewsFilesRecordsFormAndMarkdownOffline(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "design-${UUID.randomUUID()}"
        val repo = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = "阅读记录.eidos"
        val fields = JSONArray()
        fun field(key: String, name: String, kind: String, settings: JSONObject? = null) {
            fields.put(
                JSONObject()
                    .put("clientKey", key)
                    .put("name", name)
                    .put("kind", kind)
                    .put("position", fields.length().toString())
                    .apply { if (settings != null) put("settings", settings) }
            )
        }
        field("title", "书名", "text")
        field("author", "作者", "text")
        field(
            "status",
            "状态",
            "select",
            JSONObject(
                """{"options":[{"name":"在读","color":"green"},{"name":"待读","color":"gray"},{"name":"已读","color":"blue"}]}"""
            ),
        )
        field("date", "开始日期", "date")
        field("rating", "评分", "integer", JSONObject("""{"display":{"kind":"rating","max":5}}"""))
        field(
            "tags",
            "标签",
            "multi-select",
            JSONObject(
                """{"options":[{"name":"设计","color":"blue"},{"name":"心理学","color":"purple"}]}"""
            ),
        )
        field("notes", "笔记", "text")
        NativeRuntime.call(
            File(root, path).path,
            "create",
            JSONObject().put("title", "阅读记录").put("fields", fields),
        )
        var page = repo.loadEidos(path)
        val byName = page.fields.associate { it.name to it.id }
        listOf(
                "设计心理学" to "Donald Norman",
                "系统之美" to "Donella Meadows",
                "思考，快与慢" to "Daniel Kahneman",
                "原则" to "Ray Dalio",
                "深度工作" to "Cal Newport",
                "心流" to "Mihaly Csikszentmihalyi",
            )
            .forEachIndexed { index, (title, author) ->
                repo.mutate(
                    page,
                    null,
                    mapOf(
                        byName.getValue("书名") to title,
                        byName.getValue("作者") to author,
                        byName.getValue("状态") to if (index < 2) "在读" else "待读",
                        byName.getValue("开始日期") to "2026-10-02",
                        byName.getValue("评分") to "4",
                        byName.getValue("标签") to JSONArray(listOf("设计", "心理学")),
                        byName.getValue("笔记") to "好的设计，让人知道下一步做什么。",
                    ),
                )
                page = repo.loadEidos(path)
            }
        val markdown = repo.create("", "旅行计划", "markdown")
        repo.saveText(
            repo
                .readText(markdown)
                .copy(
                    text =
                        "# 京都，慢一点\n\n10月 · 四天三晚\n\n这次不赶景点，留一点时间散步、看书。\n\n## 出发前\n\n- [x] 确认住宿\n- [x] 下载离线地图\n- [ ] 整理随身物品\n\n## 第一天 · 沿河散步\n\n| 时间 | 安排 |\n| --- | --- |\n| 15:00 | 办理入住 |\n| 17:00 | 鸭川散步 |\n| 19:00 | 晚餐 |\n\n[阅读记录.eidos](./阅读记录.eidos)\n"
                )
        )
        repo.setFavorite(Favorite(repo.create("", "收件箱", "folder"), "收件箱"), true)
        repo.create("", "笔记", "folder")
        val model = withContext(Dispatchers.Main) { EidosModel(app, repo) }
        fun shot(name: String) {
            compose.waitForIdle()
            val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
            File(app.getExternalFilesDir(null), "design-$name.png").outputStream().use {
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
            bitmap.recycle()
        }
        try {
            compose.runOnUiThread { compose.activity.setContent { EidosApp(model) } }
            compose.waitUntil(15_000) { model.state.value.spaceId == id && !model.state.value.busy }
            compose.onNodeWithText("本地 Space · 可离线使用").assertIsDisplayed()
            compose.onNodeWithText("最近使用").assertExists()
            shot("files")
            compose.onAllNodesWithText(path).onFirst().performClick()
            compose.waitUntil(15_000) {
                model.state.value.page?.rows?.size == 6 && !model.state.value.busy
            }
            compose.onNodeWithContentDescription("筛选（0）").assertIsDisplayed()
            compose.onNodeWithContentDescription("排序").assertIsDisplayed()
            compose.onNodeWithContentDescription("字段（", substring = true).assertIsDisplayed()
            shot("records")
            compose.onNodeWithText("设计心理学").performClick()
            compose.waitUntil(15_000) {
                compose.onAllNodesWithText("书名").fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithContentDescription("作者").assertTextContains("Donald Norman")
            shot("form")
            compose
                .onNodeWithContentDescription("笔记")
                .performScrollTo()
                .assertTextContains("好的设计，让人知道下一步做什么。")
            shot("form-details")
            compose.onNodeWithContentDescription("返回").performClick()
            compose.onNodeWithContentDescription("返回").performClick()
            compose.waitUntil(15_000) { model.state.value.page == null && !model.state.value.busy }
            compose.onAllNodesWithText(markdown).onFirst().performScrollTo().performClick()
            compose.waitUntil(15_000) {
                model.state.value.document?.path == markdown && !model.state.value.busy
            }
            compose.onNodeWithText("已保存在本机").assertIsDisplayed()
            shot("markdown")
            assertEquals(6, repo.loadEidos(path).rows.size)
            assertNull(model.state.value.error)
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            repo.close()
            root.deleteRecursively()
        }
    }
}
