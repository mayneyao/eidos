package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class OptionFieldUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun multiSelectionPreservesOrderAndCanRemoveUnknownValues() {
        val field =
            EidosField(
                "tags",
                "标签",
                "multi-select",
                true,
                true,
                JSONObject(
                    """{"options":[{"name":"旅行","color":"blue"},{"name":"工作","color":"green"}]}"""
                ),
            )
        var result: Any = JSONArray(listOf("旧标签"))
        compose.activity.setContent {
            var value by remember { mutableStateOf(result) }
            MaterialTheme {
                OptionInput(field, value, true) {
                    value = it
                    result = it
                }
            }
        }
        compose.onNodeWithText("选择标签（1）").performClick()
        compose.onNodeWithText("旅行").performClick()
        compose.onNodeWithText("工作").performClick()
        compose.runOnIdle { assertEquals(listOf("旧标签", "旅行", "工作"), optionNames(result)) }
        compose.onAllNodesWithText("旧标签").onLast().performClick()
        compose.onNodeWithText("选择完成").performClick()
        compose.onNodeWithText("选择标签（2）").assertExists()
        compose.onNodeWithText("选择标签（2）").performClick()
        compose.onAllNodesWithText("旅行").onLast().performClick()
        compose.onAllNodesWithText("工作").onLast().performClick()
        compose.onNodeWithText("选择完成").performClick()
        compose.runOnIdle { assertEquals(emptyList<String>(), optionNames(result)) }
    }

    @Test
    fun singleSelectionReplacesValueAndClosesMenu() {
        val field =
            EidosField(
                "status",
                "状态",
                "select",
                true,
                true,
                JSONObject("""{"options":[{"name":"完成","color":"green"}]}"""),
            )
        var result: Any = JSONObject.NULL
        compose.activity.setContent {
            var value by remember { mutableStateOf(result) }
            MaterialTheme {
                OptionInput(field, value, true) {
                    value = it
                    result = it
                }
            }
        }
        compose.onNodeWithText("选择状态").performClick()
        compose.onNodeWithText("完成").performClick()
        compose.onAllNodesWithText("完成").assertCountEquals(1)
        compose.runOnIdle { assertEquals("完成", result) }
    }
}
