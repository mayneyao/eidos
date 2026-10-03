package space.eidos.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.After
import org.junit.Rule
import org.junit.Test

class EditorUiTest {
    @get:Rule(order = 0)
    val nativeEditor =
        object : org.junit.rules.ExternalResource() {
            private val app
                get() =
                    androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                        .targetContext

            override fun before() {
                app.getSharedPreferences("editor", 0).edit().putBoolean("web", false).commit()
            }

            override fun after() {
                app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
            }
        }
    @get:Rule(order = 1) val compose = createAndroidComposeRule<MainActivity>()
    private var createdPath: String? = null

    @After
    fun cleanup() {
        createdPath?.let { path ->
            kotlinx.coroutines.runBlocking {
                val repository = SpaceRepository(compose.activity)
                repository
                    .favorites()
                    .filter { it.path == path }
                    .forEach { repository.setFavorite(it, false) }
            }
            java.io.File(compose.activity.filesDir, "spaces/personal/$path").delete()
        }
    }

    @Test
    fun createMarkdownEditSaveAndRead() {
        val name = "UI 笔记 ${System.currentTimeMillis()}"
        createdPath = "$name.md"
        compose.onNodeWithContentDescription("新建").performClick()
        compose.onNodeWithText("导入文件").assertIsDisplayed()
        compose.onNodeWithText("导入文件夹").assertIsDisplayed()
        compose.onNodeWithText("新建文件夹").assertIsDisplayed()
        compose.onNodeWithText("新建笔记").performClick()
        compose.onNodeWithText("名称").performTextInput(name)
        compose.onNodeWithText("创建", useUnmergedTree = true).performClick()
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("开始记录…").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("开始记录…").performTextInput("# 手机笔记\n\n已完成原生编辑验证。")
        compose
            .onNodeWithText("# 手机笔记\n\n已完成原生编辑验证。")
            .performTextInputSelection(androidx.compose.ui.text.TextRange(9, 12))
        compose.onNodeWithText("加粗").performClick()
        val formatted = "# 手机笔记\n\n已**完成原**生编辑验证。"
        compose.onNodeWithText(formatted).assertIsFocused()
        compose.onNodeWithText("完成").performClick()
        awaitReading()
        compose.onNodeWithText("已保存在本机").assertIsDisplayed()
        compose.onNodeWithContentDescription("返回").performClick()
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("资料").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onAllNodesWithText("$name.md").onFirst().performClick()
        awaitReading()
        compose.onNodeWithContentDescription("编辑").performClick()
        compose.onNodeWithText(formatted).assertExists()
    }

    private fun awaitReading() {
        try {
            compose.waitUntil(15_000) {
                compose.onAllNodesWithContentDescription("编辑").fetchSemanticsNodes().isNotEmpty()
            }
        } catch (error: Throwable) {
            val model =
                androidx.lifecycle.ViewModelProvider(compose.activity)[EidosModel::class.java]
            throw AssertionError("State: ${model.state.value}", error)
        }
    }

    @Test
    fun createEidosAndEditRecordThroughNativeForm() {
        val name = "UI 数据 ${System.currentTimeMillis()}"
        createdPath = "$name.eidos"
        compose.onNodeWithContentDescription("新建").performClick()
        compose.onNodeWithText("新建 .eidos 文件").performClick()
        compose.onNodeWithText("名称").performTextInput(name)
        compose.onNodeWithText("创建", useUnmergedTree = true).performClick()
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("新增记录").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("新增记录").performClick()
        compose.onNodeWithContentDescription("标题").performTextInput("在手机上新增")
        compose.onNodeWithContentDescription("笔记").performTextInput("真实 Runtime 写入")
        compose.onNodeWithText("完成").performClick()
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("在手机上新增").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("在手机上新增").assertIsDisplayed()
        compose.onNodeWithContentDescription("收藏此表").performClick()
        compose.waitUntil(15_000) {
            compose.onAllNodesWithContentDescription("取消收藏此表").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithContentDescription("返回").performClick()
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("收藏").fetchSemanticsNodes().isNotEmpty()
        }
        // Open the favorite table before adding a record; + only adds directory content.
        compose.onAllNodesWithText("记录").onLast().performClick()
        compose.onNodeWithText("新增记录").performClick()
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("标题").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithContentDescription("标题").performTextInput("从收藏快速新增")
        compose.onNodeWithText("完成").performClick()
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("从收藏快速新增").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("在手机上新增").assertIsDisplayed()
    }
}
