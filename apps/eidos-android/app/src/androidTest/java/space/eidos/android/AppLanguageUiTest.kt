package space.eidos.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class AppLanguageUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun switchesNativeLanguageAndPersistsPreference() {
        val context = compose.activity.applicationContext
        val original = AppLanguage.selected()
        try {
            compose.runOnUiThread { AppLanguage.set(context, "zh") }
            compose.waitForIdle()
            compose.onNodeWithContentDescription("当前文件夹操作").performClick()
            compose.onNodeWithText("语言").performClick()
            compose.onNodeWithText("English").performClick()
            compose.onNodeWithText("Follow system").assertIsDisplayed()
            assertEquals("en", AppLanguage.selected())
            assertEquals("en", context.getSharedPreferences("appearance", 0).getString("app-language", null))
            assertEquals("Open file", tr("打开文件"))
            assertEquals("Delete “{1}”?", tr("删除「{0}」？", "{1}"))
            compose.onNodeWithText("中文").performClick()
            compose.onNodeWithText("跟随系统").assertIsDisplayed()
            assertEquals("zh", AppLanguage.selected())
            compose.onNodeWithText("跟随系统").performClick()
            assertEquals("system", AppLanguage.selected())
        } finally {
            compose.runOnUiThread { AppLanguage.set(context, original) }
        }
    }
}
