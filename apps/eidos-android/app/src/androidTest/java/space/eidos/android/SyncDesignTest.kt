package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.cancel
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class SyncDesignTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun peerProgressShowsBytesAndKeepsValidationSeparateFromCompletion() {
        val application = compose.activity.application
        val id = "peer-progress-${UUID.randomUUID()}"
        lateinit var model: EidosModel
        val base = PeerSyncProgress(spaceName = "个人知识库", fingerprint = "air", remoteId = "shared")
        val state = mutableStateOf(AppState(spaceId = id, peerBusy = true,
            peerDevices = listOf(PeerDevice("air", "MacBook Air")),
            peerSpaces = listOf(PeerSpace("shared", "个人知识库", "https://127.0.0.1:1", "air")),
            peerAvailability = mapOf("air" to PeerAvailability(true, setOf("shared"))), peerProgress = base))
        fun capture(name: String) {
            compose.onRoot().captureToImage().asAndroidBitmap().let { bitmap ->
                File(application.cacheDir, "peer-progress-$name.png").outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }
            }
        }
        try {
            compose.runOnUiThread {
                model = EidosModel(application, SpaceRepository(application, id))
                compose.activity.setContent { MaterialTheme(colorScheme = eidosColorScheme()) { SyncScreen(state.value, model) } }
            }
            compose.onNodeWithText(base.stage).assertIsDisplayed()
            capture("connecting")
            compose.runOnIdle { state.value = state.value.copy(peerProgress = base.copy(stage = "获取清单")) }
            compose.onNodeWithText("正在计算本次下载总量").assertIsDisplayed()
            capture("manifest")
            compose.runOnIdle { state.value = state.value.copy(peerProgress = base.copy(stage = "下载数据", downloadBytes = 1048576, downloadTotal = 4194304, downloadPlanned = true)) }
            compose.onNodeWithText("25%", substring = true).assertIsDisplayed()
            compose.onNodeWithText("停止同步").assertIsDisplayed()
            capture("transfer")
            compose.runOnIdle { state.value = state.value.copy(peerProgress = base.copy(stage = "写入文件", downloadBytes = 4194304, downloadTotal = 4194304, downloadPlanned = true)) }
            compose.onNodeWithText("写入文件").assertIsDisplayed()
            compose.onNodeWithText("100%", substring = true).assertDoesNotExist()
            compose.onNodeWithText("正在计算本次下载总量").assertDoesNotExist()
            capture("materialize")
            compose.runOnIdle { state.value = state.value.copy(peerProgress = base.copy(stage = "正在完成下载", downloadBytes = 4194304, downloadTotal = 4194304)) }
            compose.onNodeWithText("正在完成下载").assertIsDisplayed()
            compose.onNodeWithText("100%", substring = true).assertDoesNotExist()
            capture("validation")
            compose.runOnIdle { state.value = state.value.copy(peerBusy = false, peerProgress = base.copy(stage = "同步未完成", error = "data.eidos 数据校验未通过，请重试。", finishedAt = 1)) }
            compose.onNodeWithText("data.eidos 数据校验未通过，请重试。").assertIsDisplayed()
            capture("failure")
            compose.runOnIdle { state.value = state.value.copy(
                peerLocalSpaces = listOf(PeerLocalSpace(id, "个人知识库", "air", "shared", System.currentTimeMillis(), listOf("files.eidos"))),
                peerProgress = base.copy(stage = "同步完成", finishedAt = 1, warning = "files.eidos 已保留，需要电脑端支持的功能，暂无法在本机打开。")) }
            compose.onNodeWithText("同步完成").assertIsDisplayed()
            compose.onNodeWithText("files.eidos 已保留", substring = true).assertIsDisplayed()
            compose.onNodeWithText("停止同步").assertDoesNotExist()
            capture("completed")
            compose.runOnIdle { state.value = state.value.copy(peerProgress = null) }
            compose.onNodeWithText("files.eidos 已保留", substring = true).assertIsDisplayed()
            capture("persistent-warning")
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            NativeGraft.call(File(application.filesDir, "spaces/$id").path, "close")
            File(application.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun pairingRemainsReachableWithLargeTextInLandscape() {
        val application = compose.activity.application
        val id = "sync-large-text-${UUID.randomUUID()}"
        lateinit var model: EidosModel
        var initialized = false
        val orientation = compose.activity.requestedOrientation
        try {
            compose.runOnUiThread {
                compose.activity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            }
            compose.waitUntil(10000) { compose.activity.resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE }
            compose.runOnUiThread {
                model = EidosModel(application, SpaceRepository(application, id))
                initialized = true
                compose.activity.setContent {
                    val density = androidx.compose.ui.platform.LocalDensity.current
                    androidx.compose.runtime.CompositionLocalProvider(
                        androidx.compose.ui.platform.LocalDensity provides androidx.compose.ui.unit.Density(density.density, fontScale = 2f)
                    ) { MaterialTheme(colorScheme = eidosColorScheme()) { SyncScreen(AppState(spaceId = id), model) } }
                }
            }
            compose.onNodeWithText("扫描配对二维码").performScrollTo().assertIsDisplayed().assertIsEnabled()
            compose.onNodeWithText("使用配对码").performScrollTo().performClick()
            compose.onNodeWithText("配对码").performScrollTo().assertIsDisplayed()
            compose.onRoot().captureToImage().asAndroidBitmap().let { bitmap ->
                File(application.cacheDir, "sync-large-text-landscape.png").outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }
            }
        } finally {
            compose.runOnUiThread { if (initialized) model.viewModelScope.cancel(); compose.activity.requestedOrientation = orientation }
            NativeGraft.call(File(application.filesDir, "spaces/$id").path, "close")
            File(application.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun downloadProgressKeepsTheFollowingActionInPlace() {
        val progress = mutableStateOf<DownloadProgress?>(null)
        compose.activity.setContent {
            MaterialTheme {
                androidx.compose.foundation.layout.Column {
                    DownloadProgressView(progress.value)
                    androidx.compose.material3.Text("下载到本机")
                }
            }
        }
        val before = compose.onNodeWithText("下载到本机").fetchSemanticsNode().boundsInRoot
        compose.runOnIdle { progress.value = DownloadProgress("测试", "正在下载并写入文件", 1048576) }
        compose.onNodeWithText("正在下载并写入文件").assertIsDisplayed()
        compose.onNodeWithText("已接收", substring = true).assertIsDisplayed()
        assertEquals(before, compose.onNodeWithText("下载到本机").fetchSemanticsNode().boundsInRoot)
        compose.runOnIdle { progress.value = null }
        compose.onNodeWithText("已接收", substring = true).assertDoesNotExist()
        assertEquals(before, compose.onNodeWithText("下载到本机").fetchSemanticsNode().boundsInRoot)
    }

    @Test
    fun deviceSelectionScopesSpacesAndRetainsOfflineCopies() {
        val application = compose.activity.application
        val id = "sync-design-${UUID.randomUUID()}"
        lateinit var model: EidosModel
        val state = mutableStateOf(AppState(spaceId = id, graft = GraftState(true, false),
            peerProgress = PeerSyncProgress(spaceName = "旧 Space", error = "Space is closed", finishedAt = 1)))
        try {
            compose.runOnUiThread {
                model = EidosModel(application, SpaceRepository(application, id))
                compose.activity.setContent { MaterialTheme(colorScheme = eidosColorScheme()) { SyncScreen(state.value, model) } }
            }
            compose.onNodeWithText("连接你的电脑").assertIsDisplayed()
            compose.onNodeWithText("旧 Space").assertDoesNotExist()
            compose.onNodeWithText("Space is closed").assertDoesNotExist()
            compose.onNodeWithText("本地版本").assertDoesNotExist()
            compose.onNodeWithText("扫描配对二维码").performScrollTo().assertIsEnabled()
            compose.runOnIdle {
                state.value = state.value.copy(
                    peerDevices = listOf(PeerDevice("air", "MacBook Air"), PeerDevice("mini", "Mac mini")),
                    peerAvailability = mapOf("air" to PeerAvailability(true, setOf("shared", "work")), "mini" to PeerAvailability(true, setOf("shared"))),
                    peerSpaces = listOf(PeerSpace("shared", "个人知识库", "https://127.0.0.1:1", "air"),
                        PeerSpace("work", "工作笔记", "https://127.0.0.1:1", "air"),
                        PeerSpace("shared", "另一台电脑的资料", "https://127.0.0.1:2", "mini")),
                    peerLocalSpaces = listOf(PeerLocalSpace(id, "个人知识库", "air", "shared", System.currentTimeMillis()))
                )
            }
            compose.onNodeWithText("MacBook Air").assertIsDisplayed()
            compose.onNodeWithText("个人知识库").assertIsDisplayed()
            compose.onNodeWithText("工作笔记").assertIsDisplayed()
            compose.onNodeWithText("另一台电脑的资料").assertDoesNotExist()
            compose.onNodeWithText("下载").assertIsEnabled()
            compose.onNodeWithText("扫描配对二维码").assertDoesNotExist()
            val shortList = state.value.peerSpaces
            compose.runOnIdle {
                state.value = state.value.copy(peerSpaces = shortList + (1..20).map { PeerSpace("extra-$it", "资料 $it", "https://127.0.0.1:1", "air") })
            }
            compose.onNodeWithText("资料 20").performScrollTo().assertIsDisplayed()
            compose.onNodeWithText("MacBook Air").assertIsDisplayed()
            compose.runOnIdle { state.value = state.value.copy(peerSpaces = shortList,
                peerProgress = PeerSyncProgress(spaceName = "个人知识库", fingerprint = "air", remoteId = "shared", error = "Space is closed", finishedAt = 1)) }
            compose.onNodeWithText("个人知识库").performScrollTo()
            compose.onNodeWithText("电脑已关闭此 Space。请重新打开并开启设备同步，再重试。").assertIsDisplayed()
            compose.onNodeWithText("Space is closed").assertDoesNotExist()
            compose.onRoot().captureToImage().asAndroidBitmap().let { bitmap ->
                File(application.cacheDir, "sync-device-spaces.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            }
            compose.onNodeWithText("MacBook Air").performClick()
            compose.onNodeWithText("选择设备").assertIsDisplayed()
            compose.onNodeWithText("Mac mini").performClick()
            compose.waitForIdle()
            compose.onNodeWithText("另一台电脑的资料").assertIsDisplayed()
            compose.onNodeWithText("电脑已关闭此 Space。请重新打开并开启设备同步，再重试。").assertDoesNotExist()
            compose.onNodeWithText("个人知识库").assertDoesNotExist()
            compose.onNodeWithText("工作笔记").assertDoesNotExist()
            compose.onNodeWithText("Mac mini").performClick()
            compose.onNodeWithText("MacBook Air").performClick()
            compose.waitForIdle()
            compose.runOnIdle { state.value = state.value.copy(peerAvailability = mapOf("air" to PeerAvailability(false))) }
            compose.onNodeWithText("个人知识库").assertIsDisplayed()
            compose.onNode(hasText("同步") and hasClickAction()).assertIsNotEnabled()
            compose.onNodeWithText("下载").assertIsNotEnabled()
            compose.onNodeWithText("管理此设备").assertDoesNotExist()
            compose.onNodeWithText("解除配对").assertDoesNotExist()
            compose.onNodeWithContentDescription("设备操作").performClick()
            compose.onNodeWithText("刷新设备状态").assertIsEnabled()
            compose.onNodeWithText("解除配对").performClick()
            compose.onNodeWithText("解除与「MacBook Air」的配对？").assertIsDisplayed()
            compose.onNodeWithText("取消").performClick()
            compose.onNodeWithText("个人知识库").assertIsDisplayed()
            compose.onNodeWithContentDescription("个人知识库 操作").performClick()
            compose.onNodeWithText("本地版本").assertIsDisplayed()
            compose.onNodeWithText("本地版本").assertExists()
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().uiAutomation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK)
            compose.onNodeWithText("MacBook Air").performClick()
            compose.onNodeWithText("连接新设备").performClick()
            compose.onAllNodes(hasText("电脑已关闭此 Space。请重新打开并开启设备同步，再重试。") and hasAnyAncestor(isDialog())).assertCountEquals(0)
            compose.onNodeWithText("使用配对码").performClick()
            compose.onNodeWithText("输入配对码").assertIsDisplayed()
            compose.onNode(isDialog()).captureToImage().asAndroidBitmap().let { bitmap ->
                File(application.cacheDir, "sync-pairing-clean.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            }
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            NativeGraft.call(File(application.filesDir, "spaces/$id").path, "close")
            File(application.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
