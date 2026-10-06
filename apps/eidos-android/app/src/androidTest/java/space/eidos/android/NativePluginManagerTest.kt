package space.eidos.android

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import java.util.UUID
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativePluginManagerTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun nativeSwitchReviewsPermissionsAndUninstallWorksWithoutWebView() {
        val app = compose.activity.application
        val name = "native-manager-${UUID.randomUUID()}"
        val preferences = app.getSharedPreferences(name, 0)
        val manifest =
            JSONObject(
                """{"id":"test.native","name":"Native test","version":"1.0.0","workspace":{"files":{"read":true,"write":true}}}"""
            )
        val store = PluginMarketStore(app, name)
        preferences
            .edit()
            .putString(
                "installed",
                JSONObject()
                    .put(
                        "test.native",
                        JSONObject().put("manifest", manifest).put("revision", "test"),
                    )
                    .toString(),
            )
            .commit()
        fun hasWeb(view: View): Boolean =
            view is WebView ||
                (view is ViewGroup && (0 until view.childCount).any { hasWeb(view.getChildAt(it)) })
        try {
            compose.runOnUiThread {
                compose.activity.setContent {
                    MaterialTheme { PluginMarketScreen(store, "test", "Test Space", {}) }
                }
            }
            compose.onNodeWithText("已安装").assertExists()
            compose.runOnIdle { assertFalse(hasWeb(compose.activity.window.decorView)) }
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                .uiAutomation
                .takeScreenshot()
                .let { bitmap ->
                    java.io
                        .File(
                            compose.activity.getExternalFilesDir(null),
                            "native-plugin-manager.png",
                        )
                        .outputStream()
                        .use {
                            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                        }
                    bitmap.recycle()
                }
            compose.onNodeWithContentDescription("启用 Native test").performClick()
            compose.onNodeWithText("启用 Native test").assertExists()
            compose.onNodeWithText("可读取和修改当前 Space 的普通文件。", substring = true).assertExists()
            compose.onNodeWithText("取消").performClick()
            assertFalse(store.installed("test").single().enabled)
            compose.onNodeWithContentDescription("启用 Native test").performClick()
            compose.onNodeWithText("启用", useUnmergedTree = true).performClick()
            compose.waitUntil(5000) { store.installed("test").single().enabled }
            compose.onNodeWithContentDescription("管理 Native test").performClick()
            compose.onNodeWithText("卸载插件").performClick()
            compose.onAllNodesWithText("卸载").onLast().performClick()
            compose.waitUntil(5000) { store.installed("test").isEmpty() }
            compose.onNodeWithText("还没有安装插件").assertExists()
        } finally {
            compose.runOnUiThread { compose.activity.setContent {} }
            preferences.edit().clear().commit()
        }
    }
}
