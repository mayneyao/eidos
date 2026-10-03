package space.eidos.android

import android.graphics.Bitmap
import android.graphics.Color
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.nio.file.Files
import java.util.UUID
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class FilePreviewTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun opensImageFromFilesAndKeepsExternalSnapshotsIsolated(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "file-preview-${UUID.randomUUID()}"
        val repo = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val folder = repo.create("", "图片", "folder")
        val image = File(root, "$folder/照片 #1.PNG")
        Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888).also { bitmap ->
            bitmap.eraseColor(Color.GREEN)
            image.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
        val ordinary = File(root, "$folder/archive.bin").apply { writeBytes(byteArrayOf(0, -1, 7)) }
        val model = withContext(Dispatchers.Main) { EidosModel(app, repo) }
        try {
            compose.runOnUiThread { compose.activity.setContent { EidosApp(model) } }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.spaceId == id }
            compose.onAllNodesWithText(folder).onFirst().performClick()
            compose.waitUntil(15_000) {
                !model.state.value.busy && model.state.value.folder == folder
            }
            compose.onNodeWithText(image.name).performClick()
            compose.waitUntil(15_000) { model.state.value.attachmentPreview != null }
            compose.onNodeWithContentDescription(image.name).assertIsDisplayed()
            assertEquals(Color.GREEN, model.state.value.attachmentPreview!!.image!!.getPixel(0, 0))
            compose.onNodeWithText("关闭预览").performClick()
            assertEquals(folder, model.state.value.folder)
            compose.onNodeWithText(ordinary.name).performClick()
            compose.waitUntil(15_000) { model.state.value.attachmentPreview != null }
            compose.onNodeWithText("打开方式").assertIsDisplayed()
            val preview = model.state.value.attachmentPreview!!
            assertEquals("content", preview.uri.scheme)
            assertNull(preview.image)
            assertEquals("application/octet-stream", preview.mediaType)
            ordinary.writeBytes(byteArrayOf(1, 2, 3))
            app.contentResolver.openInputStream(preview.uri)!!.use {
                assertArrayEquals(byteArrayOf(0, -1, 7), it.readBytes())
            }
            compose.onNodeWithText("关闭预览").performClick()
            Files.createSymbolicLink(File(root, "$folder/link.bin").toPath(), ordinary.toPath())
            assertTrue(runCatching { repo.filePreview("$folder/link.bin") }.isFailure)
            assertNull(model.state.value.error)
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            repo.close()
            root.deleteRecursively()
        }
    }
}
