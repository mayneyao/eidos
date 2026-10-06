package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test

class SyncUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun lanOnboardingDoesNotExposeAccountCloudOrPublish() {
        val id = "lan-ui-${UUID.randomUUID()}"
        val application = compose.activity.application
        val repository = SpaceRepository(application, id)
        lateinit var model: EidosModel
        runBlocking { repository.create("", "Local note", "markdown") }
        try {
            compose.runOnUiThread {
                model = EidosModel(application, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15_000) { !model.state.value.busy }
            compose.onNode(hasText("同步") and hasClickAction()).performClick()
            if (model.state.value.peerDevices.isNotEmpty()) {
                compose.onNodeWithContentDescription("选择设备").performClick()
                compose.onNodeWithText("连接新设备").performClick()
            }
            compose.onNodeWithText("扫描配对二维码").performScrollTo().assertIsEnabled()
            compose.onNodeWithContentDescription("账号与登录").assertDoesNotExist()
            compose.onNodeWithText("云端 Space").assertDoesNotExist()
            compose.onNodeWithText("使用配对码").performScrollTo().performClick()
            compose.onNodeWithText("配对码").performTextInput("unfinished-pairing")
            compose.onNodeWithContentDescription("返回同步").performClick()
            compose.onNode(hasText("资料") and hasClickAction()).performClick()
            compose.onNode(hasText("同步") and hasClickAction()).performClick()
            if (model.state.value.peerDevices.isNotEmpty()) {
                compose.onNodeWithContentDescription("选择设备").performClick()
                compose.onNodeWithText("连接新设备").performClick()
            }
            compose.onNodeWithText("使用配对码").performScrollTo().performClick()
            compose.onNodeWithText("unfinished-pairing").performScrollTo().assertExists()
            compose.onNodeWithText("同步设置").assertDoesNotExist()
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            File(application.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
