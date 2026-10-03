package space.eidos.android

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.text.Spanned
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.activity.compose.setContent
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import io.noties.markwon.image.AsyncDrawableSpan
import java.io.File
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class MarkdownImagesTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun rendersLocalImageDownsamplesLargeImageAndShowsMissingPlaceholder(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "images-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val folder = repository.create("", "笔记", "folder")
        val path = repository.create(folder, "图片", "markdown")
        val root = File(app.filesDir, "spaces/$id")
        val picture = File(root, "图 片.png")
        val bitmap =
            Bitmap.createBitmap(4096, 64, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.GREEN) }
        picture.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        repository.saveText(
            repository.readText(path).copy(text = "![绿色图片](../图%20片.png)\n\n![不存在](missing.png)")
        )
        assertTrue(runCatching { repository.markdownImage(path, "../../outside.png") }.isFailure)
        assertTrue(
            runCatching { repository.markdownImage(path, "file:///data/private.png") }.isFailure
        )
        var model: EidosModel? = null
        try {
            compose.runOnUiThread {
                val isolated = EidosModel(app, repository)
                model = isolated
                compose.activity.setContent { EidosApp(isolated) }
            }
            compose.waitUntil(15_000) { model?.state?.value?.busy == false }
            val file = repository.file(path)
            compose.runOnUiThread { model!!.open(file) }
            fun images(view: View): List<AsyncDrawableSpan> {
                if (view is TextView && view.text is Spanned) {
                    val text = view.text as Spanned
                    return text.getSpans(0, text.length, AsyncDrawableSpan::class.java).sortedBy {
                        text.getSpanStart(it)
                    }
                }
                return if (view is ViewGroup)
                    (0 until view.childCount).flatMap { images(view.getChildAt(it)) }
                else emptyList()
            }
            compose.waitUntil(15_000) {
                compose.runOnIdle {
                    val spans = images(compose.activity.window.decorView)
                    spans.size == 2 && spans.all { it.drawable.hasResult() }
                }
            }
            compose.runOnIdle {
                val spans = images(compose.activity.window.decorView)
                val result = spans[0].drawable.result
                assertTrue(
                    "Image failed: ${(result as? ImageUnavailable)?.reason}; destination: ${spans[0].drawable.destination}",
                    result is BitmapDrawable,
                )
                val loaded = result as BitmapDrawable
                assertEquals(2048, loaded.bitmap.width)
                assertEquals(32, loaded.bitmap.height)
                assertEquals(Color.GREEN, loaded.bitmap.getPixel(10, 10))
                assertTrue(spans[1].drawable.result is ImageUnavailable)
                assertTrue(spans[0].drawable.bounds.width() > 0)
            }
            // The async drawable result precedes TextView layout and the compositor frame.
            // Wait for actual pixels, not only Compose idleness or successful decoding.
            compose.waitUntil(15_000) {
                val screenshot =
                    androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                        .uiAutomation
                        .takeScreenshot()
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
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            root.deleteRecursively()
        }
    }
}
