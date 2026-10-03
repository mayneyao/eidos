package space.eidos.android

import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.activity.compose.setContent
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class MarkdownTasksUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun tappingTaskPersistsOnlyItsMarkerAndRejectsExternalChanges(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "tasks-${UUID.randomUUID()}"
        val repo = SpaceRepository(app, id)
        val path = repo.create("", "任务", "markdown")
        val original = "# 今日\r\n\r\n- [ ] 重复\r\n  - [X] 重复\r\n\r\n```\r\n- [ ] 代码\r\n```\r\n"
        repo.saveText(repo.readText(path).copy(text = original))
        val model = withContext(Dispatchers.Main) { EidosModel(app, repo) }
        try {
            withTimeout(15_000) { model.state.first { !it.busy } }
            withContext(Dispatchers.Main) {
                compose.activity.setContent { EidosApp(model) }
                model.open(repo.file(path))
            }
            compose.waitUntil(15_000) {
                model.state.value.document != null && !model.state.value.busy
            }
            fun reader(view: View): TextView? {
                if (view is TextView && view.text.contains("☐")) return view
                if (view is ViewGroup)
                    for (i in 0 until view.childCount) reader(view.getChildAt(i))?.let {
                        return it
                    }
                return null
            }
            val point =
                compose.runOnIdle {
                    val text = checkNotNull(reader(compose.activity.window.decorView))
                    val spans = text.text as android.text.Spanned
                    assertEquals(
                        0,
                        spans
                            .getSpans(
                                0,
                                spans.length,
                                io.noties.markwon.core.spans.BulletListItemSpan::class.java,
                            )
                            .size,
                    )
                    val offset = text.text.indexOf('☐')
                    val line = text.layout.getLineForOffset(offset)
                    val location = IntArray(2)
                    text.getLocationOnScreen(location)
                    floatArrayOf(
                        location[0] +
                            text.totalPaddingLeft +
                            (text.layout.getPrimaryHorizontal(offset) +
                                text.layout.getPrimaryHorizontal(offset + 1)) / 2f,
                        location[1] +
                            text.totalPaddingTop +
                            (text.layout.getLineTop(line) + text.layout.getLineBottom(line)) / 2f,
                    )
                }
            val time = android.os.SystemClock.uptimeMillis()
            InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot().let { bitmap
                ->
                File(app.getExternalFilesDir(null), "markdown-tasks.png").outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }
                bitmap.recycle()
            }
            listOf(android.view.MotionEvent.ACTION_DOWN, android.view.MotionEvent.ACTION_UP)
                .forEach { action ->
                    val event =
                        android.view.MotionEvent.obtain(
                            time,
                            android.os.SystemClock.uptimeMillis(),
                            action,
                            point[0],
                            point[1],
                            0,
                        )
                    InstrumentationRegistry.getInstrumentation().sendPointerSync(event)
                    event.recycle()
                }
            val expected = original.replaceFirst("[ ]", "[x]")
            compose.waitUntil(15_000) {
                model.state.value.document?.text == expected && !model.state.value.busy
            }
            assertEquals(expected, repo.readText(path).text)
            assertNull(model.state.value.error)
            val stale = checkNotNull(model.state.value.document)
            File(app.filesDir, "spaces/$id/$path").writeText("外部更新")
            withContext(Dispatchers.Main) {
                model.toggleMarkdownTask(stale, expected.indexOf("[x]") + 1, true)
            }
            compose.waitUntil(15_000) { model.state.value.error != null && !model.state.value.busy }
            assertEquals("外部更新", repo.readText(path).text)
            assertEquals(expected, model.state.value.document?.text)
        } finally {
            withContext(Dispatchers.Main) { model.viewModelScope.cancel() }
            repo.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
