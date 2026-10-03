package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assume
import org.junit.Rule
import org.junit.Test

class SyncUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun configurePublishSyncAndDisconnectFromNativeUi() {
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            android.os.ParcelFileDescriptor.AutoCloseInputStream(
                    instrumentation.uiAutomation.executeShellCommand(
                        "pm grant ${instrumentation.targetContext.packageName} android.permission.POST_NOTIFICATIONS"
                    )
                )
                .use { it.readBytes() }
        }
        val base = InstrumentationRegistry.getArguments().getString("graftRemoteUrl")
        Assume.assumeNotNull(base)
        val id = "sync-ui-${UUID.randomUUID()}"
        val application = compose.activity.application
        val repository = SpaceRepository(application, id)
        var model: EidosModel? = null
        val path = runBlocking {
            val path = repository.create("", "同步笔记", "markdown")
            repository.saveText(repository.readText(path).copy(text = "# 界面同步验证\n"))
            path
        }
        try {
            compose.runOnUiThread {
                val isolated = EidosModel(application, repository)
                model = isolated
                compose.activity.setContent { EidosApp(isolated) }
            }
            compose.waitUntil(15_000) { model?.state?.value?.busy == false }
            compose.onNodeWithText("同步").performClick()
            compose.onNodeWithText("同步设置").performScrollTo().performClick()
            compose.onNodeWithText("高级：手动连接 Graft 远程").performScrollTo().performClick()
            compose.onNodeWithText("远程地址").performTextInput("$base/android/ui-${UUID.randomUUID()}")
            compose.onNodeWithText("访问令牌（可选）").performTextInput("ephemeral-test-token")
            compose.onNodeWithText("保存连接").performScrollTo().performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.graft?.remoteUrl != null && model?.state?.value?.busy == false
            }
            compose.onNodeWithText("发布本机版本").performScrollTo().performClick()
            compose.waitUntil(30_000) {
                model?.state?.value?.syncMessage == "本机版本已发布到远程" &&
                    model?.state?.value?.busy == false
            }
            compose.onNodeWithContentDescription("返回同步").performClick()
            compose.onNodeWithText("立即同步").performScrollTo().performClick()
            compose.waitUntil(30_000) {
                model?.state?.value?.syncMessage == "本次同步已完成" && model?.state?.value?.busy == false
            }
            compose.onNodeWithText("本次同步已完成").assertIsDisplayed()
            compose.onNodeWithContentDescription("自动同步开关").performScrollTo().performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.automaticSync?.enabled == true &&
                    model?.state?.value?.busy == false
            }
            assertEquals(true, BackgroundSync.automaticSettings(application, id).enabled)
            compose.onNodeWithContentDescription("自动同步开关").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.automaticSync?.enabled == false &&
                    model?.state?.value?.busy == false
            }
            compose.onNodeWithText("同步设置").performScrollTo().performClick()
            compose.onNodeWithText("断开连接").performScrollTo().performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.graft?.remoteUrl == null && model?.state?.value?.busy == false
            }
            assertEquals("# 界面同步验证\n", runBlocking { repository.readText(path).text })
        } catch (error: Throwable) {
            throw AssertionError("Sync UI state: ${model?.state?.value}", error)
        } finally {
            runBlocking { BackgroundSync.setAutomatic(application, id, false) }
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            SyncProfileStore(application, id).clear()
            val root = File(application.filesDir, "spaces/$id")
            NativeGraft.call(root.path, "close")
            root.deleteRecursively()
        }
    }
}
