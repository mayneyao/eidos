package space.eidos.android

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.cancel
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class PluginReadmeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun installedPluginOpensCachedReadmeAndReturnsToNativeList() {
        val app = compose.activity.application
        val name = "readme-test-${UUID.randomUUID()}"
        val id = "test.readme"
        val prefs = app.getSharedPreferences(name, 0)
        val cache = app.getSharedPreferences("plugin-market", 0)
        val previousCache = cache.getString("readme:$id", null)
        val store = PluginMarketStore(app, name)
        val manifest = JSONObject().put("id", id).put("name", "README test").put("version", "1.0.0")
        prefs
            .edit()
            .putString(
                "installed",
                JSONObject()
                    .put(id, JSONObject().put("manifest", manifest).put("revision", "test"))
                    .toString(),
            )
            .commit()
        cache
            .edit()
            .putString(
                "readme:$id",
                JSONObject()
                    .put(
                        "markdown",
                        "# Plugin guide\n\nA **mobile** README.\n\n[Guide](docs/guide.md)\n\n<script>window.compromised=true</script>",
                    )
                    .put("baseUrl", "https://raw.githubusercontent.com/eidos-space/demo/master/")
                    .put("fetchedAt", System.currentTimeMillis())
                    .toString(),
            )
            .commit()
        var model: EidosModel? = null
        fun find(view: View): WebView? =
            when (view) {
                is WebView -> view
                is ViewGroup ->
                    (0 until view.childCount).firstNotNullOfOrNull { find(view.getChildAt(it)) }
                else -> null
            }
        fun evaluate(script: String): String {
            val latch = CountDownLatch(1)
            var result = ""
            compose.runOnUiThread {
                val web = find(compose.activity.window.decorView)
                if (web == null) {
                    result = "false"
                    latch.countDown()
                    return@runOnUiThread
                }
                web.evaluateJavascript(script) {
                    result = it
                    latch.countDown()
                }
            }
            assertTrue(latch.await(5, TimeUnit.SECONDS))
            return result
        }
        try {
            compose.runOnUiThread {
                model = EidosModel(app)
                compose.activity.setContent {
                    MaterialTheme {
                        var opened by remember { mutableStateOf(false) }
                        if (opened)
                            MobilePluginScreen(
                                model!!,
                                pluginId = id,
                                readme = true,
                                title = "README test",
                                close = { opened = false },
                            )
                        else
                            PluginMarketScreen(
                                store,
                                "test",
                                "Test Space",
                                {},
                                openReadme = { _, _ -> opened = true },
                            )
                    }
                }
            }
            compose.onNodeWithText("README test").performClick()
            compose.waitUntil(15000) {
                evaluate("!!document.querySelector('.plugin-readme h1')") == "true"
            }
            assertEquals("\"Plugin guide\"", evaluate("document.querySelector('h1').textContent"))
            assertEquals(
                "\"https://github.com/eidos-space/demo/blob/master/docs/guide.md\"",
                evaluate("document.querySelector('.plugin-readme a').href"),
            )
            assertEquals("false", evaluate("window.compromised === true"))
            assertEquals("true", evaluate("document.documentElement.scrollWidth <= innerWidth"))
            val painted = CountDownLatch(1)
            compose.runOnUiThread {
                find(compose.activity.window.decorView)!!.postVisualStateCallback(
                    1,
                    object : WebView.VisualStateCallback() {
                        override fun onComplete(requestId: Long) {
                            painted.countDown()
                        }
                    },
                )
            }
            assertTrue(painted.await(5, TimeUnit.SECONDS))
            android.os.SystemClock.sleep(200)
            InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot().let { bitmap
                ->
                java.io
                    .File(compose.activity.getExternalFilesDir(null), "plugin-readme.png")
                    .outputStream()
                    .use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
                bitmap.recycle()
            }
            compose.onNodeWithText("返回").performClick()
            compose.onNodeWithText("已安装").assertExists()
            compose.onNodeWithText("README test").assertExists()
        } finally {
            compose.runOnUiThread {
                compose.activity.setContent {}
                model?.viewModelScope?.cancel()
            }
            prefs.edit().clear().commit()
            if (previousCache == null) cache.edit().remove("readme:$id").commit()
            else cache.edit().putString("readme:$id", previousCache).commit()
        }
    }
}
