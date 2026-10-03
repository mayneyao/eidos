package space.eidos.android

import android.app.Application
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
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

class MarkdownNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun tappingRenderedRelativeLinkAndBackNavigatesDocuments() = runBlocking {
        val app = compose.activity.application
        val id = "link-ui-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val source = repository.create("", "起点", "markdown")
        val target = repository.create("", "终点", "markdown")
        repository.saveText(repository.readText(source).copy(text = "[下一篇](./终点.md)"))
        repository.saveText(repository.readText(target).copy(text = "目标正文"))
        val model = withContext(Dispatchers.Main) { EidosModel(app, repository) }
        try {
            withTimeout(15_000) { model.state.first { !it.busy } }
            val file = repository.file(source)
            withContext(Dispatchers.Main) {
                compose.activity.setContent { EidosApp(model) }
                model.open(file)
            }
            compose.waitUntil(15_000) {
                model.state.value.document?.path == source && !model.state.value.busy
            }
            val point =
                compose.runOnIdle {
                    fun find(view: android.view.View): android.widget.TextView? {
                        if (view is android.widget.TextView && view.text.toString() == "下一篇")
                            return view
                        if (view is android.view.ViewGroup)
                            for (index in 0 until view.childCount) {
                                find(view.getChildAt(index))?.let {
                                    return it
                                }
                            }
                        return null
                    }
                    val text = checkNotNull(find(compose.activity.window.decorView))
                    val location = IntArray(2)
                    text.getLocationOnScreen(location)
                    floatArrayOf(
                        location[0] + text.totalPaddingLeft + text.layout.getPrimaryHorizontal(1),
                        location[1] +
                            text.totalPaddingTop +
                            (text.layout.getLineTop(0) + text.layout.getLineBottom(0)) / 2f,
                    )
                }
            val time = android.os.SystemClock.uptimeMillis()
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
            compose.waitUntil(15_000) {
                model.state.value.document?.path == target && !model.state.value.busy
            }
            compose.onNodeWithContentDescription("返回").performClick()
            compose.waitUntil(15_000) {
                model.state.value.document?.path == source && !model.state.value.busy
            }
            assertNull(model.state.value.error)
        } finally {
            withContext(Dispatchers.Main) { model.viewModelScope.cancel() }
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun localLinksOpenCanonicalDataAndBackRestoresSource() = runBlocking {
        val app =
            InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
                as Application
        val id = "links-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val folder = repository.create("", "笔记", "folder")
        val source = repository.create(folder, "起点", "markdown")
        val target = repository.create("", "资料 空格", "eidos")
        val model = withContext(Dispatchers.Main) { EidosModel(app, repository) }
        suspend fun awaitReady() = withTimeout(15_000) { model.state.first { !it.busy } }
        try {
            awaitReady()
            val file = repository.file(source)
            withContext(Dispatchers.Main) { model.open(file) }
            assertEquals(source, awaitReady().document?.path)
            withContext(Dispatchers.Main) { model.openMarkdownLink(source, "missing.md") }
            val failed = awaitReady()
            assertNotNull(failed.error)
            assertEquals(source, failed.document?.path)
            withContext(Dispatchers.Main) { model.openMarkdownLink(source, "../资料%20空格.eidos") }
            val opened = awaitReady()
            assertNull(opened.error)
            assertNull(opened.document)
            assertEquals(target, opened.page?.path)
            withContext(Dispatchers.Main) { model.back() }
            val back = awaitReady()
            assertNull(back.page)
            assertEquals(source, back.document?.path)
        } finally {
            withContext(Dispatchers.Main) { model.viewModelScope.cancel() }
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
