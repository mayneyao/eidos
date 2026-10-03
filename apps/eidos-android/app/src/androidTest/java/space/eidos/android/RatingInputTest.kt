package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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

class RatingInputTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    private fun field(settings: String = """{"display":{"kind":"rating","min":0,"max":5}}""") =
        EidosField("score", "评分", "integer", true, true, JSONObject(settings))

    @Test
    fun choosesZeroClearsAndPreservesFullInt64Input() {
        var result: Any = "9223372036854775807"
        var updates = 0
        compose.activity.setContent {
            var value by remember { mutableStateOf(result) }
            MaterialTheme {
                RatingInput(field(), value, true) {
                    value = it
                    result = it
                    updates++
                }
            }
        }
        compose.onNodeWithText("评分数值").assertTextContains("9223372036854775807")
        compose.runOnIdle { assertEquals(0, updates) }
        compose.onNodeWithContentDescription("评分：4 分").performClick()
        compose.runOnIdle { assertEquals("4", result) }
        compose.onNodeWithContentDescription("评分：0 分").performClick()
        compose.onNodeWithText("0 分").assertExists()
        compose.runOnIdle { assertEquals("0", result) }
        compose.onNodeWithText("清空评分").performClick()
        compose.onNodeWithText("未评分").assertExists()
        compose.runOnIdle { assertEquals(JSONObject.NULL, result) }
        compose.onNodeWithText("输入数值").performClick()
        compose.onNodeWithText("评分数值").performTextReplacement("-9223372036854775808")
        compose.runOnIdle { assertEquals("-9223372036854775808", result) }
        compose.onNodeWithText("评分数值").performTextClearance()
        compose.runOnIdle { assertEquals(JSONObject.NULL, result) }
    }

    @Test
    fun honorsDisplayRangeAndFallsBackWithoutClamping() {
        var result: Any = "8"
        var enabled by mutableStateOf(true)
        var config by mutableStateOf(field("""{"display":{"kind":"rating","min":2,"max":3}}"""))
        compose.activity.setContent {
            var value by remember { mutableStateOf(result) }
            MaterialTheme {
                RatingInput(config, value, enabled) {
                    value = it
                    result = it
                }
            }
        }
        compose.onNodeWithContentDescription("评分：0 分").assertDoesNotExist()
        compose.onNodeWithContentDescription("评分：1 分").assertDoesNotExist()
        compose.onNodeWithText("评分数值").assertTextContains("8")
        compose.onNodeWithContentDescription("评分：3 分").performClick()
        compose.runOnIdle {
            assertEquals("3", result)
            enabled = false
        }
        compose.onNodeWithContentDescription("评分：2 分").assertIsNotEnabled()
        compose.runOnIdle { config = field("""{"display":{"kind":"rating","max":1000000000}}""") }
        compose.onNodeWithContentDescription("评分：3 分").assertDoesNotExist()
        compose.onNodeWithText("评分数值").assertTextContains("3").assertIsNotEnabled()
    }

    @Test
    fun recordFormWritesRatingThroughCanonicalRuntime(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "rating-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = "评分.eidos"
        var model: EidosModel? = null
        try {
            NativeRuntime.call(
                File(root, path).path,
                "create",
                JSONObject()
                    .put("title", "评分")
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
                                    .put("clientKey", "score")
                                    .put("name", "评分")
                                    .put("kind", "integer")
                                    .put("position", "1")
                                    .put("settings", field().settings)
                            ),
                    ),
            )
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model!!) }
            }
            compose.waitUntil(15_000) {
                model?.state?.value?.spaceId == id && model?.state?.value?.busy == false
            }
            compose.onNodeWithText(path).performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.page != null && model?.state?.value?.busy == false
            }
            compose.onNodeWithText("新增记录").performClick()
            compose.onNodeWithContentDescription("标题").performTextInput("触摸评分")
            compose.onNodeWithContentDescription("评分：4 分").performScrollTo().performClick()
            compose.waitForIdle()
            val screenshot =
                androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                    .uiAutomation
                    .takeScreenshot()
            File(app.getExternalFilesDir(null), "rating-input.png").outputStream().use {
                screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
            screenshot.recycle()
            compose.onNodeWithText("完成").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.page?.rows?.size == 1 && model?.state?.value?.busy == false
            }
            val page = repository.loadEidos(path)
            val rating = page.fields.first { it.name == "评分" }
            assertEquals("4", page.rows.single().values[rating.id])
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            repository.close()
            root.deleteRecursively()
        }
    }
}
