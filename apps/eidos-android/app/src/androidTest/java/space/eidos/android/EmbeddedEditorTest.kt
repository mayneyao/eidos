package space.eidos.android

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class EmbeddedEditorTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun returningToFilesIsImmediateAndDoesNotBlockTheNextNavigation() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "return-test-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val note = runBlocking { repository.create("", "Note", "markdown") }
        val folder = runBlocking { repository.create("", "Folder", "folder") }
        val noteFile = runBlocking { repository.file(note) }
        val folderFile = runBlocking { repository.file(folder) }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread { model = EidosModel(app, repository) }
            compose.waitUntil(15_000) {
                model.state.value.files.isNotEmpty() && !model.state.value.busy
            }
            compose.runOnUiThread { model.open(noteFile) }
            compose.waitUntil(15_000) {
                model.state.value.webFile != null && !model.state.value.busy
            }
            compose.runOnUiThread {
                val cached = model.state.value.files
                model.leaveWebEditor(false)
                assertNull(model.state.value.webFile)
                assertFalse(model.state.value.busy)
                assertSame(cached, model.state.value.files)
                // A tap during metadata refresh must be accepted, and its new folder
                // must not be replaced by the old directory's late refresh result.
                model.open(folderFile)
            }
            compose.waitUntil(15_000) {
                model.state.value.folder == folder && !model.state.value.busy
            }
            compose.runOnIdle {
                assertTrue(model.state.value.files.isEmpty())
                assertNull(model.state.value.error)
            }
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
        }
    }

    private fun findWeb(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup)
            for (i in 0 until view.childCount) findWeb(view.getChildAt(i))?.let {
                return it
            }
        return null
    }

    private fun js(script: String): String {
        val latch = CountDownLatch(1)
        var result = ""
        compose.runOnUiThread {
            val web = findWeb(compose.activity.window.decorView)
            // WebView can drop evaluation callbacks while navigating to the initial document.
            if (web == null || web.progress < 100) {
                result = "false"
                latch.countDown()
            } else
                web.evaluateJavascript(script) {
                    result = it
                    latch.countDown()
                }
        }
        assertTrue(latch.await(10, TimeUnit.SECONDS))
        return result
    }

    private fun waitJs(expression: String) {
        compose.waitUntil(30_000) { js(expression) == "true" }
    }

    private fun screenshot(name: String) {
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
            .uiAutomation
            .takeScreenshot()
            .let { bitmap ->
                File(compose.activity.getExternalFilesDir(null), name).outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }
                bitmap.recycle()
            }
    }

    @Test
    fun sharedEditorsPersistToLocalFilesAndCanSwitchToNative() {
        val app = compose.activity.application
        app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        val id = "web-test-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val note = runBlocking { repository.create("", "Web note", "markdown") }
        File(root, note).writeText("# Shared Markdown\n\nOriginal text\n")
        val data = runBlocking { repository.create("", "Web data", "eidos") }
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15_000) {
                model.state.value.files.isNotEmpty() && !model.state.value.busy
            }
            compose.runOnUiThread { model.open(runBlocking { repository.file(note) }) }
            compose.waitUntil(15_000) { model.state.value.webFile != null }
            waitJs(
                "document.querySelector('[contenteditable=true]') !== null && document.querySelector('.eme-mobile-toolbar') !== null"
            )
            assertTrue(js("document.body.innerText").contains("Shared Markdown"))
            var firstWeb: WebView? = null
            compose.runOnUiThread { firstWeb = findWeb(compose.activity.window.decorView) }
            js("window.editorShellMarker = 'retained'")
            assertEquals("true", js("document.querySelector('.markdown-page > .tools') === null"))
            compose.runOnUiThread { findWeb(compose.activity.window.decorView)!!.requestFocus() }
            js(
                "(()=>{const t=document.querySelector('[contenteditable=true] p').firstChild;const r=document.createRange();r.selectNodeContents(t);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));})()"
            )
            js("document.querySelector('button[aria-label=加粗]').click()")
            compose.waitUntil(15_000) { File(root, note).readText().contains("**Original text**") }
            js(
                """
                (() => {
                  const native = window.EidosAndroid;
                  window.markdownSaveCount = 0;
                  window.EidosAndroid = { postMessage(raw) {
                    const message = JSON.parse(raw);
                    window.lastSession = message.session;
                    if (message.method === 'markdown.save') window.markdownSaveCount++;
                    native.postMessage(raw);
                  }};
                  const editor = document.querySelector('[contenteditable=true]');
                  editor.focus();
                  const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
                  getSelection().removeAllRanges(); getSelection().addRange(range);
                  let count = 0;
                  const type = () => {
                    document.execCommand('insertText', false, 'z');
                    if (++count < 12) setTimeout(type, 10); else window.typingDone = true;
                  };
                  type();
                })()
            """
                    .trimIndent()
            )
            waitJs("window.typingDone === true")
            compose.waitUntil(15_000) { File(root, note).readText().contains("zzzzzzzzzzzz") }
            assertEquals("1", js("window.markdownSaveCount"))
            js("document.execCommand('insertText', false, 'background-flushed')")
            compose.activityRule.scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED)
            runBlocking {
                kotlinx.coroutines.withTimeout(15_000) {
                    while (!File(root, note).readText().contains("background-flushed")) kotlinx
                        .coroutines
                        .delay(20)
                }
            }
            compose.activityRule.scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED)
            compose.runOnUiThread {
                assertSame(firstWeb, findWeb(compose.activity.window.decorView))
            }
            js(
                "document.querySelector('[contenteditable=true]').focus(); const r = document.createRange(); r.selectNodeContents(document.querySelector('[contenteditable=true]')); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r)"
            )
            assertEquals(
                "true",
                js("document.querySelector('main').getBoundingClientRect().height > 100"),
            )
            screenshot("embedded-markdown.png")
            assertEquals(
                "true",
                js(
                    "document.querySelector('.eme-mobile-toolbar').getBoundingClientRect().bottom <= innerHeight + 1"
                ),
            )
            js(
                "window.retiredSession = window.lastSession; document.execCommand('insertText', false, 'exit-flushed'); window.eidosLeave('native')"
            )
            compose.waitUntil(15_000) {
                model.state.value.webFile == null && model.state.value.document != null
            }
            assertTrue(model.state.value.document!!.text.contains("Original text"))
            assertTrue(model.state.value.document!!.text.contains("**"))
            assertTrue(model.state.value.document!!.text.contains("exit-flushed"))
            compose.runOnUiThread { model.useSharedEditor(data) }
            compose.waitUntil(15_000) {
                model.state.value.webFile?.path == data && !model.state.value.busy
            }
            waitJs("document.querySelector('select')?.options.length > 0")
            compose.runOnUiThread {
                assertSame(firstWeb, findWeb(compose.activity.window.decorView))
            }
            assertEquals("\"retained\"", js("window.editorShellMarker"))
            js(
                """
                (() => {
                  const reply = window.eidosReply;
                  const activeSession = window.lastSession;
                  window.eidosReply = (id, result) => {
                    if (id === 'session-check') window.sessionChecked = true;
                    else reply(id, result);
                  };
                  window.EidosAndroid.postMessage(JSON.stringify({id:'stale-leave',session:window.retiredSession,method:'leave',params:{mode:'back'}}));
                  window.EidosAndroid.postMessage(JSON.stringify({id:'session-check',session:activeSession,method:'editor.ready'}));
                })()
            """
                    .trimIndent()
            )
            waitJs("window.sessionChecked === true")
            assertEquals(data, model.state.value.webFile?.path)
            js(
                "(()=>{const s=document.querySelector('select[aria-label=新建视图]');s.value='gallery';s.dispatchEvent(new Event('change',{bubbles:true}));})()"
            )
            waitJs(
                "document.querySelector('[role=tablist][aria-label=视图] [role=tab][aria-selected=true]')?.textContent.includes('画廊') === true"
            )
            assertEquals("null", js("document.querySelector('[role=alert]')?.textContent ?? null"))
            js(
                "Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='新增').click()"
            )
            waitJs("document.querySelector('textarea[aria-label=标题]')?.disabled === false")
            assertEquals(
                "true",
                js("document.querySelector('main').getBoundingClientRect().height > 100"),
            )
            compose.runOnUiThread { findWeb(compose.activity.window.decorView)!!.requestFocus() }
            js(
                "(()=>{const t=document.querySelector('textarea[aria-label=标题]');t.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'WebView record');t.dispatchEvent(new Event('input',{bubbles:true}));})()"
            )
            waitJs("document.querySelector('textarea[aria-label=标题]')?.title === 'WebView record'")
            assertEquals(
                "true",
                js("document.activeElement === document.querySelector('textarea[aria-label=标题]')"),
            )
            js("document.activeElement.blur()")
            waitJs("document.querySelector('textarea[aria-label=标题]')?.value === 'WebView record'")
            waitJs("document.querySelector('[role=alert]') === null")
            screenshot("embedded-record.png")
            // Read through the same serialized canonical Runtime transport, without ending its
            // session.
            val snapshot = runBlocking {
                repository.embeddedRuntime(data, "getSnapshot", org.json.JSONObject())
            }
            assertNotNull(snapshot)
            compose.onNodeWithContentDescription("文件操作").performClick()
            compose.onNodeWithText("使用原生编辑器").performClick()
            compose.waitUntil(15_000) {
                model.state.value.webFile == null && model.state.value.page != null
            }
            assertEquals(1, model.state.value.page!!.rows.size)
            assertTrue(model.state.value.page!!.views.any { it.name == "画廊" })
            assertTrue(
                model.state.value.page!!.rows.toString(),
                model.state.value.page!!.rows.toString().contains("WebView record"),
            )
            File(root, "broken.eidos").writeText("not a SQLite database")
            compose.runOnUiThread { model.useSharedEditor("broken.eidos") }
            compose.waitUntil(15_000) { model.state.value.webFile?.path == "broken.eidos" }
            waitJs("Boolean(document.querySelector('[role=alert]')?.textContent)")
            compose.waitUntil(15_000) {
                compose
                    .onAllNodes(
                        SemanticsMatcher.keyIsDefined(
                            androidx.compose.ui.semantics.SemanticsProperties.ProgressBarRangeInfo
                        )
                    )
                    .fetchSemanticsNodes()
                    .isEmpty()
            }
            compose.onNodeWithContentDescription("返回文件").performClick()
            compose.waitUntil(15_000) { model.state.value.webFile == null }
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            app.getSharedPreferences("editor", 0).edit().putBoolean("web", true).commit()
        }
    }
}
