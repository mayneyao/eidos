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
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Rule
import org.junit.Test

class MergeUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun previewsResumesAndChoosesRemoteVersion() = exercise(false)

    @Test fun abortRestoresLocalVersion() = exercise(true)

    private fun exercise(abort: Boolean) {
        val base = InstrumentationRegistry.getArguments().getString("graftRemoteUrl")
        Assume.assumeNotNull(base)
        val context = compose.activity.application
        val id = "merge-ui-${UUID.randomUUID()}"
        val repository = SpaceRepository(context, id)
        val peer = File(context.cacheDir, "$id-peer").apply { mkdirs() }
        val url = "$base/android/$id"
        var model: EidosModel? = null
        try {
            runBlocking {
                repository.create("", "笔记", "markdown")
                repository.connectRemote(url, "ephemeral-test-token")
                repository.syncRemote(true)
                NativeGraft.call(
                    peer.path,
                    "clone",
                    JSONObject().put("url", "graft+$url").put("token", "ephemeral-test-token"),
                )
                File(peer, "笔记.md").writeText("远端修改内容")
                NativeGraft.call(peer.path, "checkpoint")
                NativeGraft.call(peer.path, "push")
                repository.saveText(repository.readText("笔记.md").copy(text = "本机修改内容"))
            }
            fun mount() {
                compose.runOnUiThread {
                    model?.viewModelScope?.cancel()
                    model = EidosModel(context, SpaceRepository(context, id))
                    compose.activity.setContent { EidosApp(model!!) }
                }
                compose.waitUntil(15_000) {
                    model?.state?.value?.busy == false && model?.state?.value?.spaceId == id
                }
            }
            mount()
            compose.onNodeWithText("同步").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.busy == false && model?.state?.value?.graft != null
            }
            compose.onNodeWithText("同步设置").performScrollTo().performClick()
            compose.onNodeWithText("检查并合并").performScrollTo().performClick()
            compose.waitUntil(30_000) {
                model?.state?.value?.mergeReview != null && model?.state?.value?.busy == false
            }
            assertEquals(1, model!!.state.value.mergeReview!!.unresolved)
            // Normal sync must defer without checkpointing an active merge.
            assertEquals("needs_merge", runBlocking { repository.syncRemote() })
            mount()
            compose.onNodeWithText("合并版本").assertIsDisplayed()
            if (abort) {
                compose.onNodeWithText("中止合并").performClick()
                compose.onNodeWithText("确认中止").performClick()
            } else {
                compose.onNodeWithText("查看两个版本").performClick()
                compose.waitUntil(15_000) {
                    model?.state?.value?.mergeComparison != null &&
                        model?.state?.value?.busy == false
                }
                compose.onNodeWithText("本机修改内容").assertIsDisplayed()
                compose.onNodeWithText("远端修改内容").assertIsDisplayed()
                compose.waitForIdle()
                val screenshot =
                    InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
                File(context.getExternalFilesDir(null), "merge-review.png").outputStream().use {
                    screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }
                screenshot.recycle()
                compose.onNodeWithText("使用远端文件").performClick()
                compose.onNodeWithText("选择整个文件版本").assertIsDisplayed()
                compose.onNodeWithText("确认选择").performClick()
                compose.waitUntil(15_000) {
                    model?.state?.value?.mergeReview?.unresolved == 0 &&
                        model?.state?.value?.busy == false
                }
                compose.onNodeWithText("保存合并").performClick()
            }
            compose.waitUntil(15_000) {
                model?.state?.value?.mergeReview == null && model?.state?.value?.busy == false
            }
            assertEquals(
                if (abort) "本机修改内容" else "远端修改内容",
                runBlocking { repository.readText("笔记.md").text },
            )
            assertNull(runBlocking { repository.mergeReview() })
            if (!abort) {
                assertEquals("pending", runBlocking { repository.graftStatus().syncStatus })
                assertEquals("synced", runBlocking { repository.syncRemote() })
            }
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            runBlocking { repository.close() }
            NativeGraft.call(peer.path, "close")
            SyncProfileStore(context, id).clear()
            File(context.filesDir, "spaces/$id").deleteRecursively()
            peer.deleteRecursively()
        }
    }
}
