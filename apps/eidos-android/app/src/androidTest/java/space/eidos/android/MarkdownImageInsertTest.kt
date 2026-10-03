package space.eidos.android

import android.graphics.Bitmap
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.content.FileProvider
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class MarkdownImageInsertTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun insertsPortableImageAtSelectionAndRetainsDraftOnConflict(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "insert-image-${UUID.randomUUID()}"
        val repo = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val fixture = File(app.cacheDir, "test-share/$id").apply { mkdirs() }
        val image = File(fixture, "旅行 (1).png")
        Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888).also { bitmap ->
            image.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
        fun uri(file: File) = FileProvider.getUriForFile(app, "${app.packageName}.testshare", file)
        val folder = repo.create("", "笔记", "folder")
        val path = repo.create(folder, "旅行", "markdown")
        repo.saveText(repo.readText(path).copy(text = "前文替换后文"))
        val model = withContext(Dispatchers.Main) { EidosModel(app, repo) }
        try {
            compose.runOnUiThread { compose.activity.setContent { EidosApp(model) } }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.spaceId == id }
            val file = repo.file(path)
            compose.runOnUiThread { model.open(file) }
            compose.waitUntil(15_000) {
                model.state.value.document != null && !model.state.value.busy
            }
            compose.onNodeWithContentDescription("编辑").performClick()
            compose.onNodeWithText("图片").assertIsDisplayed()
            compose.runOnUiThread { model.insertMarkdownImage(path, "前文替换后文", 2, 4, uri(image)) }
            compose.waitUntil(15_000) {
                !model.state.value.busy && model.state.value.document!!.text.contains("![](")
            }
            assertNull(model.state.value.error)
            val text = File(root, path).readText()
            assertTrue(text.startsWith("前文![](assets/"))
            assertTrue(text.endsWith(")后文"))
            val destination = text.substringAfter("![](").substringBefore(')')
            val copied = File(root, markdownLocalPath(path, destination))
            assertArrayEquals(image.readBytes(), copied.readBytes())
            assertTrue(destination.contains("%28"))
            val invalid = File(fixture, "invalid.png").apply { writeText("not an image") }
            val before = root.walkTopDown().filter { it.isFile }.count()
            assertTrue(runCatching { repo.importMarkdownImage(path, uri(invalid)) }.isFailure)
            assertEquals(before, root.walkTopDown().filter { it.isFile }.count())
            File(root, path).writeText("外部修改")
            compose.runOnUiThread { model.insertMarkdownImage(path, text, 0, 0, uri(image)) }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.error != null }
            assertEquals("外部修改", File(root, path).readText())
            assertTrue(repo.readText(path).text.startsWith("![](assets/"))
            assertTrue(model.state.value.dirty)
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            repo.close()
            root.deleteRecursively()
            fixture.deleteRecursively()
        }
    }
}
