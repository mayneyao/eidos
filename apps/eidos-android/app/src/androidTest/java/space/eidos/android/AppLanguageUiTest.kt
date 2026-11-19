package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.cancel
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.json.JSONObject
import java.io.File
import java.util.UUID

class AppLanguageUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun customServerNavigationAndFormFollowAppLanguage() {
        val context = compose.activity.application
        val original = AppLanguage.selected()
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                AppLanguage.set(context, "en")
                model = EidosModel(context)
                compose.activity.setContent {
                    MaterialTheme { SyncScreen(AppState(), model) }
                }
            }
            compose.onNodeWithText("Custom server").assertIsDisplayed()
            compose.onNodeWithText("Connect to your own Graft server without an Eidos account").assertIsDisplayed()
            compose.onNodeWithText("Custom server").performClick()
            compose.onNodeWithText("Custom server").assertIsDisplayed()
            compose.onNodeWithText("Server address").assertIsDisplayed()
            compose.onNodeWithText("Server access key").assertIsDisplayed()
            compose.onNodeWithText("Browse server Spaces").performScrollTo().assertIsDisplayed()
            compose.runOnUiThread { AppLanguage.set(context, "zh") }
            compose.onNodeWithText("浏览服务器 Space").assertIsDisplayed()
            compose.onNodeWithContentDescription("返回同步").performClick()
            compose.onNodeWithText("自定义服务器").assertIsDisplayed()
            compose.onNodeWithText("连接自建 Graft 服务器，无需 Eidos 账号").assertIsDisplayed()
            compose.runOnUiThread { AppLanguage.set(context, "en") }
            compose.onNodeWithText("Custom server").assertIsDisplayed()
            compose.onNodeWithText("Connect to your own Graft server without an Eidos account").assertIsDisplayed()
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel(); AppLanguage.set(context, original) }
        }
    }

    @Test fun newFileTemplateUsesAppLanguageAndPreservesExistingNames() {
        val context = compose.activity.application
        val original = AppLanguage.selected()
        val directory = File(context.cacheDir, "language-${UUID.randomUUID()}").apply { mkdirs() }
        fun names(file: File): List<String> {
            val objects = NativeRuntime.call(file.path, "schema").getJSONArray("objects")
            return (0 until objects.length()).map(objects::getJSONObject)
                .filter { it.optString("object") in setOf("table", "field") }
                .filter { it.optString("name") !in setOf("_id", "_created_at", "_updated_at") }
                .map { it.getString("name") }
        }
        try {
            compose.runOnUiThread { AppLanguage.set(context, "en") }
            val english = File(directory, "english.eidos")
            val request = JSONObject().put("title", "Untitled")
            NativeRuntime.call(english.path, "create", request)
            assertEquals(false, request.has("locale"))
            assertEquals(setOf("Records", "Title", "Notes"), names(english).toSet())
            compose.runOnUiThread { AppLanguage.set(context, "zh") }
            assertEquals(setOf("Records", "Title", "Notes"), names(english).toSet())
            val chinese = File(directory, "chinese.eidos")
            NativeRuntime.call(chinese.path, "create", request)
            assertEquals(setOf("记录", "标题", "笔记"), names(chinese).toSet())
            compose.runOnUiThread { AppLanguage.set(context, "pt-BR") }
            val portuguese = File(directory, "portuguese.eidos")
            NativeRuntime.call(portuguese.path, "create", request)
            assertEquals(setOf("Registros", "Título", "Notas"), names(portuguese).toSet())
            assertEquals(setOf("Records", "Title", "Notes"), names(english).toSet())
        } finally {
            compose.runOnUiThread { AppLanguage.set(context, original) }
            directory.deleteRecursively()
        }
    }

    @Test fun deviceSyncProgressUsesEnglishWithoutChangingStageIdentity() {
        val context = compose.activity.application
        val original = AppLanguage.selected()
        lateinit var model: EidosModel
        val progress = PeerSyncProgress(stage = "获取清单", fingerprint = "test", remoteId = "space")
        try {
            compose.runOnUiThread {
                AppLanguage.set(context, "en")
                model = EidosModel(context)
                compose.activity.setContent {
                    MaterialTheme {
                        PeerInlineStatus(AppState(peerProgress = progress), model, "test", "space")
                    }
                }
            }
            compose.onNodeWithText("Fetching manifest").assertIsDisplayed()
            compose.onNodeWithText("Calculating download size").assertIsDisplayed()
            assertEquals("获取清单", progress.stage)
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel(); AppLanguage.set(context, original) }
        }
    }

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
            compose.onNodeWithText("Português (Brasil)").performClick()
            compose.onNodeWithText("Usar idioma do sistema").assertIsDisplayed()
            assertEquals("pt-BR", context.getSharedPreferences("appearance", 0).getString("app-language", null))
            assertEquals("Excluir “{1}”?", tr("删除「{0}」？", "{1}"))
            compose.runOnUiThread { AppLanguage.initialize(context) }
            assertEquals("pt-BR", AppLanguage.selected())
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
