package space.eidos.android

import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.content.FileProvider
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.nio.file.Files
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class AttachmentPreviewTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun previewsScopedImagesAndRetainsRecordDraft(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "preview-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val fixture = File(app.cacheDir, "test-share/$id/图片.png").apply { parentFile!!.mkdirs() }
        val bitmap =
            Bitmap.createBitmap(4096, 64, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.GREEN) }
        fixture.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        val folder = repository.create("", "资料", "folder")
        val path = "$folder/记录.eidos"
        NativeRuntime.call(
            File(root, path).path,
            "create",
            JSONObject()
                .put("title", "图片")
                .put(
                    "fields",
                    JSONArray()
                        .put(
                            JSONObject()
                                .put("clientKey", "title")
                                .put("name", "标题")
                                .put("kind", "text")
                                .put("position", "0")
                        )
                        .put(
                            JSONObject()
                                .put("clientKey", "files")
                                .put("name", "附件")
                                .put("kind", "file")
                                .put("position", "1")
                        ),
                ),
        )
        val empty = repository.loadEidos(path)
        val label = checkNotNull(empty.table).labelFieldId
        val field = empty.fields.single { it.kind == "file" }.id
        val source = FileProvider.getUriForFile(app, "${app.packageName}.testshare", fixture)
        repository.mutateWithAttachments(empty, null, mapOf(label to "预览记录"), field, listOf(source))
        val page = repository.loadEidos(path)
        val entry = (page.rows.single().values[field] as JSONArray).getJSONObject(0)
        var model: EidosModel? = null
        try {
            val preview = repository.attachmentPreview(path, entry)
            assertEquals(2048, preview.image!!.width)
            assertEquals(32, preview.image.height)
            assertEquals(Color.GREEN, preview.image.getPixel(4, 4))
            assertEquals("content", preview.uri.scheme)
            assertEquals("${app.packageName}.attachments", preview.uri.authority)
            assertArrayEquals(
                fixture.readBytes(),
                app.contentResolver.openInputStream(preview.uri)!!.use { it.readBytes() },
            )
            val provider = app.packageManager.resolveContentProvider(preview.uri.authority!!, 0)!!
            assertFalse(provider.exported)
            assertTrue(provider.grantUriPermissions)
            fun withUri(value: String) = JSONObject(entry.toString()).put("uri", value)
            assertTrue(
                runCatching { repository.attachmentPreview(path, withUri("../outside.png")) }
                    .isFailure
            )
            assertTrue(
                runCatching { repository.attachmentPreview(path, withUri("%2e%2e/outside.png")) }
                    .isFailure
            )
            assertTrue(
                runCatching {
                        repository.attachmentPreview(path, withUri("file:///data/private.png"))
                    }
                    .isFailure
            )
            assertTrue(
                runCatching { repository.attachmentPreview(path, withUri("assets/missing.png")) }
                    .isFailure
            )
            Files.createSymbolicLink(
                File(root, "$folder/link.png").toPath(),
                File(root, "$folder/${Uri.decode(entry.getString("uri"))}").toPath(),
            )
            assertTrue(
                runCatching { repository.attachmentPreview(path, withUri("link.png")) }.isFailure
            )
            val inline =
                repository.attachmentPreview(
                    path,
                    withUri(
                        "data:image/png;base64,${Base64.encodeToString(fixture.readBytes(), Base64.NO_WRAP)}"
                    ),
                )
            assertEquals(Color.GREEN, inline.image!!.getPixel(4, 4))
            val remote =
                repository.attachmentPreview(path, withUri("https://example.org/image.png"))
            assertTrue(remote.remote)
            assertNull(remote.image)
            assertEquals(page.revision, repository.loadEidos(path).revision)
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model!!) }
            }
            compose.waitUntil(15_000) { model?.state?.value?.busy == false }
            val file = repository.file(path)
            compose.runOnUiThread { model!!.open(file) }
            compose.waitUntil(15_000) {
                !model!!.state.value.busy && model!!.state.value.page != null
            }
            compose.onNodeWithText("预览记录").performClick()
            compose.onNodeWithContentDescription("标题").performTextReplacement("未保存的标题")
            compose.onNodeWithContentDescription("管理附件").performScrollTo().performClick()
            compose.onNodeWithText("打开").performScrollTo().performClick()
            compose.waitUntil(15_000) {
                model!!.state.value.attachmentPreview != null && !model!!.state.value.busy
            }
            compose.onNodeWithContentDescription("图片.png").assertIsDisplayed()
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            var externalIntent: android.content.Intent? = null
            val monitor =
                object : android.app.Instrumentation.ActivityMonitor() {
                    @Suppress("DEPRECATION")
                    override fun onStartActivity(
                        intent: android.content.Intent
                    ): android.app.Instrumentation.ActivityResult? {
                        if (intent.action != android.content.Intent.ACTION_CHOOSER) return null
                        externalIntent =
                            intent.getParcelableExtra(android.content.Intent.EXTRA_INTENT)
                        return android.app.Instrumentation.ActivityResult(
                            android.app.Activity.RESULT_CANCELED,
                            null,
                        )
                    }
                }
            instrumentation.addMonitor(monitor)
            try {
                compose.onNodeWithText("打开方式").performClick()
                val launched = checkNotNull(externalIntent)
                assertEquals(android.content.Intent.ACTION_VIEW, launched.action)
                assertEquals("image/png", launched.type)
                assertEquals("${app.packageName}.attachments", launched.data?.authority)
                assertTrue(
                    launched.flags and android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION != 0
                )
                assertEquals(
                    0,
                    launched.flags and android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
                assertEquals(launched.data, launched.clipData?.getItemAt(0)?.uri)
                assertArrayEquals(
                    fixture.readBytes(),
                    app.contentResolver.openInputStream(launched.data!!)!!.use { it.readBytes() },
                )
            } finally {
                instrumentation.removeMonitor(monitor)
            }
            compose.waitUntil(15_000) {
                val screenshot =
                    InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
                try {
                    val pixels = IntArray(screenshot.width * screenshot.height)
                    screenshot.getPixels(
                        pixels,
                        0,
                        screenshot.width,
                        0,
                        0,
                        screenshot.width,
                        screenshot.height,
                    )
                    pixels.count { it == Color.GREEN } > 100
                } finally {
                    screenshot.recycle()
                }
            }
            compose.onNodeWithText("关闭预览").performClick()
            compose.onNodeWithText("未保存的标题").assertExists()
            assertEquals("预览记录", repository.loadEidos(path).rows.single().values[label])
            compose.onNodeWithText("完成").performClick()
            compose.waitUntil(15_000) {
                !model!!.state.value.busy &&
                    model!!.state.value.page?.rows?.singleOrNull()?.values?.get(label) == "未保存的标题"
            }
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            repository.close()
            root.deleteRecursively()
            fixture.parentFile!!.deleteRecursively()
            app.deleteSharedPreferences("space-$id")
        }
    }
}
