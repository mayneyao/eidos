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
    fun secondaryActionsAreSeparatedAndLoadingKeepsNavigationStable() {
        val application = compose.activity.application
        val id = "sync-design-${UUID.randomUUID()}"
        lateinit var model: EidosModel
        val state = mutableStateOf(AppState(spaceId = id, graft = GraftState(true, false)))
        try {
            compose.runOnUiThread {
                model = EidosModel(application, SpaceRepository(application, id))
                compose.activity.setContent {
                    MaterialTheme { SyncScreen(state.value, model, {}, {}, {}, {}) }
                }
            }
            compose.onNodeWithText("仅保存在本机").assertIsDisplayed()
            compose.onNodeWithText("此 Space 的连接").assertIsDisplayed()
            compose.onNodeWithText("连接电脑").assertIsEnabled()
            compose.onNodeWithContentDescription("自动同步开关").assertDoesNotExist()
            // Device pairing must be reachable without an account or a cloud Space.
            compose.onNodeWithText("设备直连").performScrollTo().performClick()
            compose.onNodeWithText("扫描配对二维码").assertIsDisplayed().assertIsEnabled()
            compose.onNodeWithText("使用配对码").performScrollTo().performClick()
            compose.onNodeWithText("配对码").performScrollTo().assertIsDisplayed()
            compose.onNodeWithText("登录 Eidos 账号").assertDoesNotExist()
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        peerDevices = listOf(PeerDevice("test-device", "Mac")),
                        peerAvailability =
                            mapOf("test-device" to PeerAvailability(true, setOf("new-space"))),
                        peerSpaces =
                            listOf(
                                PeerSpace(
                                    "new-space",
                                    "Project",
                                    "https://127.0.0.1:4443",
                                    "test-device",
                                )
                            ),
                    )
            }
            compose.onNodeWithText("Mac · 选择 Space").performScrollTo().assertIsDisplayed()
            compose.onNodeWithText("下载到手机").performScrollTo().assertIsDisplayed().assertIsEnabled()
            compose.onNodeWithText("扫描配对二维码").assertDoesNotExist()
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        spaceId = "selected-peer-space",
                        busy = true,
                        peerProgress = PeerSyncProgress(stage = "电脑正在准备同步数据"),
                    )
            }
            compose.onNodeWithText("电脑正在准备同步数据").performScrollTo().assertIsDisplayed()
            compose.onNodeWithText("已用时", substring = true).performScrollTo().assertIsDisplayed()
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        busy = false,
                        peerProgress =
                            state.value.peerProgress!!.copy(
                                stage = "同步未完成",
                                finishedAt = android.os.SystemClock.elapsedRealtime(),
                                error = "电脑连接已断开",
                            ),
                    )
            }
            compose.onNodeWithText("同步未完成").assertIsDisplayed()
            compose.onNodeWithText("电脑连接已断开").assertIsDisplayed()
            compose.onNodeWithText("本地文件已更新，可离线使用").assertDoesNotExist()
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        peerProgress = null,
                        peerLocalSpaces =
                            listOf(
                                PeerLocalSpace(
                                    "selected-peer-space",
                                    "Project",
                                    "test-device",
                                    "new-space",
                                    System.currentTimeMillis(),
                                )
                            ),
                    )
            }
            compose
                .onNode(hasText("同步") and hasClickAction())
                .performScrollTo()
                .assertIsDisplayed()
                .assertIsEnabled()
            compose.onNodeWithText("打开文件").performScrollTo().assertIsDisplayed().assertIsEnabled()
            compose.onNodeWithText("下载到手机").assertDoesNotExist()
            compose.onNodeWithContentDescription("返回同步").performClick()
            compose.onNodeWithText("同步此 Space").assertIsDisplayed()
            compose.onNodeWithText("在线 · 可以同步").assertIsDisplayed()
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        peerAvailability = mapOf("test-device" to PeerAvailability(false))
                    )
            }
            compose.onNode(hasText("同步") and hasClickAction()).assertIsNotEnabled()
            compose.onNodeWithText("暂不可连接", substring = true).assertIsDisplayed()
            compose.onNodeWithText("重新检测连接").assertIsEnabled()
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        peerAvailability = mapOf("test-device" to PeerAvailability(true))
                    )
            }
            compose.onNodeWithText("设备在线 · 此 Space 尚未开放同步").assertIsDisplayed()
            compose.onNode(hasText("同步") and hasClickAction()).assertIsNotEnabled()
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        peerAvailability =
                            mapOf("test-device" to PeerAvailability(true, setOf("new-space")))
                    )
            }
            compose.onRoot().captureToImage().asAndroidBitmap().let { bitmap ->
                File(application.cacheDir, "sync-layout-connected.png").outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }
            }
            compose.onNode(hasText("同步") and hasClickAction()).assertIsDisplayed().assertIsEnabled()
            compose.onNodeWithText("登录 Eidos 账号").assertDoesNotExist()
            // Starting from Overview without switching Spaces must still expose progress.
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        busy = true,
                        peerProgress = PeerSyncProgress(stage = "电脑正在准备同步数据"),
                    )
            }
            compose.onNodeWithText("电脑正在准备同步数据").performScrollTo().assertIsDisplayed()
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        busy = false,
                        peerProgress =
                            state.value.peerProgress!!.copy(
                                stage = "同步未完成",
                                error = "电脑连接超时，请确认电脑上的 Space 已打开",
                                finishedAt = android.os.SystemClock.elapsedRealtime(),
                            ),
                    )
            }
            compose.onNodeWithText("同步未完成").assertIsDisplayed()
            compose.onNode(hasText("同步") and hasClickAction()).performScrollTo().assertIsEnabled()
            compose.runOnIdle { state.value = state.value.copy(peerProgress = null) }
            compose.onNodeWithText("高级：手动连接 Graft 远程").assertDoesNotExist()
            compose.onNodeWithContentDescription("账号与登录").performClick()
            compose.onNodeWithText("登录以连接你的设备").assertIsDisplayed()
            compose.onNodeWithContentDescription("返回同步").performClick()
            compose.onNodeWithText("本地版本").performScrollTo().performClick()
            compose.onNodeWithText("保存本地版本").assertIsDisplayed()
            compose.onNodeWithContentDescription("返回同步").performClick()
            compose.onNodeWithText("同步设置").performScrollTo().performClick()
            compose.onNodeWithText("高级：手动连接 Graft 远程").assertIsDisplayed()
            compose.onNodeWithContentDescription("返回同步").performClick()
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        peerLocalSpaces = emptyList(),
                        graft = GraftState(true, false, "https://example.org", "completed"),
                    )
            }
            compose.onNodeWithText("上次同步已完成").assertIsDisplayed()
            val before = compose.onNodeWithText("本地版本").fetchSemanticsNode().boundsInRoot
            compose.runOnIdle { state.value = state.value.copy(busy = true) }
            assertEquals(before, compose.onNodeWithText("本地版本").fetchSemanticsNode().boundsInRoot)
            compose.onNodeWithText("立即同步").assertIsNotEnabled()
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        busy = false,
                        graft = state.value.graft!!.copy(syncStatus = "needs_merge"),
                    )
            }
            compose.onNodeWithText("需要合并版本").assertIsDisplayed()
            compose.onNodeWithText("检查并合并").assertIsDisplayed()
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            NativeGraft.call(File(application.filesDir, "spaces/$id").path, "close")
            File(application.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
