package space.eidos.android

import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class MarkdownTextEditingTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun urlSupportsNativeLongPressAndSingleCharacterBackspace() {
        withMarkdown("https://example.com/page") { file ->
            touch("(()=>{const t=document.querySelector('.eme-content-editable a span').firstChild;const r=document.createRange();r.setStart(t,8);r.setEnd(t,15);return r.getBoundingClientRect()})()", 700)
            waitJs("!!getSelection()?.toString()")
            assertEquals("true", js("document.querySelector('.eme-content-editable a').closest('[contenteditable=false]')===null"))
            js("(()=>{const root=document.querySelector('.eme-content-editable');root.focus();const t=root.querySelector('a span').firstChild;const r=document.createRange();r.setStart(t,t.length);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()")
            js("requestAnimationFrame(()=>requestAnimationFrame(()=>window.testCaretReady=true))")
            waitJs("window.testCaretReady===true && getSelection().isCollapsed")
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DEL)
            waitJs("document.querySelector('.eme-content-editable').textContent==='https://example.com/pag'")
            waitJs("document.querySelector('.eme-content-editable a').getAttribute('href')==='https://example.com/pag'")
            js("window.eidosFlush().then(()=>window.testFlushed=true)")
            waitJs("window.testFlushed===true")
            assertEquals("https://example.com/pag", file.readText())
        }
    }

    @Test
    fun touchAfterCalloutAcceptsNativeKeyboardInput() {
        withMarkdown("> [!note] Tail\n> Keep") { file ->
            touch("(()=>{const root=document.querySelector('.eme-content-editable');const r=root.querySelector('[data-lexical-decorator]').getBoundingClientRect();return {left:r.left+40,top:r.bottom+24,width:4,height:4}})()")
            waitJs("document.querySelector('.eme-content-editable').lastElementChild.tagName==='P'")
            InstrumentationRegistry.getInstrumentation().sendStringSync("New paragraph")
            waitJs("document.querySelector('.eme-content-editable').textContent.includes('New paragraph')")
            js("window.eidosFlush().then(()=>window.testFlushed=true)")
            waitJs("window.testFlushed===true")
            assertTrue(file.readText().contains("New paragraph"))
        }
    }

    private fun withMarkdown(markdown: String, check: (File) -> Unit) {
        val app = compose.activity.application
        val id = "markdown-selection-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val path = runBlocking { repository.create("", "Selection", "markdown") }
        val file = root.resolve(path)
        file.writeText(markdown)
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15_000) { !model.state.value.busy }
            compose.runOnUiThread { model.open(runBlocking { repository.file(path) }) }
            waitJs("!!document.querySelector('.eme-content-editable') && typeof window.eidosFlush==='function'")
            check(file)
        } finally {
            compose.runOnUiThread { compose.activity.setContent {}; model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
        }
    }

    private fun touch(rectangle: String, duration: Long = 60) {
        val point = JSONObject(JSONTokener(js("JSON.stringify((()=>{const r=$rectangle;return {x:r.left+r.width/2,y:r.top+r.height/2,width:innerWidth}})())")).nextValue() as String)
        val origin = IntArray(2)
        var scale = 1f
        compose.runOnUiThread {
            val web = findWeb(compose.activity.window.decorView)!!
            web.getLocationOnScreen(origin)
            scale = web.width / point.getDouble("width").toFloat()
        }
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val start = android.os.SystemClock.uptimeMillis()
        for (action in listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP)) {
            val pointer = MotionEvent.PointerProperties().apply { id = 0; toolType = MotionEvent.TOOL_TYPE_FINGER }
            val coordinates = MotionEvent.PointerCoords().apply {
                x = origin[0] + point.getDouble("x").toFloat() * scale
                y = origin[1] + point.getDouble("y").toFloat() * scale
                pressure = 1f; size = 1f
            }
            val event = MotionEvent.obtain(start, android.os.SystemClock.uptimeMillis(), action, 1,
                arrayOf(pointer), arrayOf(coordinates), 0, 0, 1f, 1f, 0, 0,
                android.view.InputDevice.SOURCE_TOUCHSCREEN, 0)
            instrumentation.sendPointerSync(event)
            event.recycle()
            if (action == MotionEvent.ACTION_DOWN) android.os.SystemClock.sleep(duration)
        }
        instrumentation.waitForIdleSync()
    }

    private fun findWeb(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) findWeb(view.getChildAt(index))?.let { return it }
        return null
    }

    private fun js(script: String): String {
        val latch = CountDownLatch(1)
        var result = "false"
        compose.runOnUiThread {
            val web = findWeb(compose.activity.window.decorView)
            if (web == null || web.progress < 100) latch.countDown()
            else web.evaluateJavascript(script) { result = it; latch.countDown() }
        }
        assertTrue(latch.await(10, TimeUnit.SECONDS))
        return result
    }

    private fun waitJs(expression: String) {
        try {
            compose.waitUntil(30_000) { js(expression) == "true" }
        } catch (failure: androidx.compose.ui.test.ComposeTimeoutException) {
            throw AssertionError(expression + "\n" + js("JSON.stringify({html:document.querySelector('.eme-content-editable')?.innerHTML,focus:document.activeElement?.outerHTML,selection:getSelection()?.toString(),anchor:getSelection()?.anchorOffset})"), failure)
        }
    }
}
