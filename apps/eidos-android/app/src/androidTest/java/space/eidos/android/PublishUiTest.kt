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
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class PublishUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun publishingHasStableProgressAndNativeLinkActions() {
        val application = compose.activity.application
        val id = "publish-ui-${UUID.randomUUID()}"
        lateinit var model: EidosModel
        val file = SpaceFile("笔记/旅行清单.md", "旅行清单.md", false, 0, 100)
        val state =
            mutableStateOf(
                AppState(
                    account = SyncAccountView("Eidos", "fixture"),
                    publish =
                        PublishPage(
                            file,
                            subject = "fixture",
                            host = "fixture-staging.eidos.ink",
                            plan = "pro",
                            privateAccess = true,
                            ready = true,
                        ),
                )
            )
        try {
            compose.runOnUiThread {
                model = EidosModel(application, SpaceRepository(application, id))
                compose.activity.setContent { MaterialTheme { PublishScreen(state.value, model) } }
            }
            compose.onNodeWithText("发布路径").assertIsDisplayed()
            compose.onNodeWithText("持有密码").performClick()
            compose.onNodeWithText("访问密码").assertIsDisplayed()
            compose.onNodeWithText("发布网页").performScrollTo().assertIsNotEnabled()
            compose.onNodeWithText("所有人").performScrollTo().performClick()
            compose.onNodeWithText("发布网页").performScrollTo().assertIsEnabled()
            val before = compose.onNodeWithText("发布网页").fetchSemanticsNode().boundsInRoot
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        busy = true,
                        publish =
                            state.value.publish!!.copy(
                                progress =
                                    JSONObject()
                                        .put("kind", "bytes")
                                        .put("currentBytes", "1024")
                                        .put("totalBytes", "2048")
                                        .put("percent", 50)
                            ),
                    )
            }
            compose.onNodeWithText("1024 / 2048 bytes").assertIsDisplayed()
            assertEquals(before, compose.onNodeWithText("发布网页").fetchSemanticsNode().boundsInRoot)
            compose.runOnIdle {
                state.value =
                    state.value.copy(
                        busy = false,
                        publish =
                            state.value.publish!!.copy(
                                progress = null,
                                binding =
                                    PublicationBinding(
                                        "travel",
                                        "owned",
                                        "https://fixture-staging.eidos.ink/travel",
                                        "public",
                                        true,
                                    ),
                            ),
                    )
            }
            compose.onNodeWithText("网页已发布").performScrollTo().assertIsDisplayed()
            compose.onNodeWithText("复制链接").performClick()
            compose.onNodeWithText("已复制").assertIsDisplayed()
            compose.onNodeWithText("分享").assertIsDisplayed()
            val output = File(compose.activity.getExternalFilesDir(null), "publish-design.png")
            output.outputStream().use {
                compose
                    .onRoot()
                    .captureToImage()
                    .asAndroidBitmap()
                    .compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
            compose.onNodeWithText("取消发布").performScrollTo().performClick()
            compose.onNodeWithText("本地文件不会被删除。", substring = true).assertIsDisplayed()
            compose.onNodeWithText("保留网页").performClick()
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            NativeGraft.call(File(application.filesDir, "spaces/$id").path, "close")
            File(application.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun bindingsDoNotCrossAccountBoundaries() {
        val context = compose.activity
        val space = "publication-store-${UUID.randomUUID()}"
        val alice = PublicationStore(context, space, "alice")
        val bob = PublicationStore(context, space, "bob")
        val binding =
            PublicationBinding(
                "note",
                "alice-publication",
                "https://fixture.eidos.ink/note",
                "private",
                true,
            )
        alice.save("note.md", binding)
        assertEquals(binding, alice.load("note.md"))
        assertEquals(null, bob.load("note.md"))
        context.getSharedPreferences("publications-$space", 0).edit().clear().commit()
    }
}
