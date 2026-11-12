package space.eidos.android

import android.graphics.Bitmap
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.content.FileProvider
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class FileMoveTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun repositoryMovesDirectoryAttachmentsRecordsAndHistoryWithoutChangingReferences(): Unit = runBlocking {
        val app = compose.activity.application
        val id = SpaceCatalog(app).create("Move repository ${UUID.randomUUID()}").id
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val fixture = File(app.cacheDir, "test-share/$id/picture.png").apply { parentFile!!.mkdirs(); writeBytes(byteArrayOf(1, 2, 3, 4)) }
        try {
            repository.create("", "Source", "folder")
            repository.create("Source", "Nested", "folder")
            repository.create("", "Destination", "folder")
            val path = repository.create("Source/Nested", "Note", "markdown")
            val text = "# saved\n![image](assets/picture.png)\n[data](Data.eidos)\n"
            repository.saveText(repository.readText(path).copy(text = text))
            val data = "Source/Nested/Data.eidos"
            NativeRuntime.call(File(root, data).path, "create", JSONObject().put("title", "Data").put("fields", JSONArray(listOf(
                JSONObject().put("clientKey", "title").put("name", "Title").put("kind", "text").put("position", "0"),
                JSONObject().put("clientKey", "files").put("name", "Files").put("kind", "file").put("position", "1"),
            ))))
            val page = repository.loadEidos(data)
            val field = page.fields.single { it.kind == "file" }.id
            repository.mutateWithAttachments(page, null, mapOf(checkNotNull(page.table).labelFieldId to "kept record"), field,
                listOf(FileProvider.getUriForFile(app, "${app.packageName}.testshare", fixture)))
            val saved = repository.loadEidos(data)
            val attachment = (saved.rows.single().values[field] as JSONArray).getJSONObject(0).getString("uri")
            File(root, "Source/Nested/assets/picture.png").writeBytes(fixture.readBytes())
            repository.setFavorite(Favorite(path, "Note.md"), true)
            repository.readText(path)
            NativeGraft.call(root.path, "checkpoint")
            assertEquals("Destination/Source", repository.move("Source", "Destination"))
            assertFalse(File(root, "Source").exists())
            val next = "Destination/Source/Nested"
            assertEquals(text, repository.readText("$next/Note.md").text)
            assertArrayEquals(fixture.readBytes(), repository.markdownImage("$next/Note.md", "assets/picture.png"))
            val moved = repository.loadEidos("$next/Data.eidos")
            assertEquals(saved.revision, moved.revision)
            assertEquals(saved.rows.single().id, moved.rows.single().id)
            assertEquals(attachment, (moved.rows.single().values[field] as JSONArray).getJSONObject(0).getString("uri"))
            assertArrayEquals(fixture.readBytes(), File(root, "$next/${Uri.decode(attachment)}").readBytes())
            assertEquals("$next/Note.md", repository.favorites().single().path)
            assertTrue(repository.recent().any { it.path == "$next/Note.md" })
            NativeGraft.call(root.path, "checkpoint")
            assertEquals(2, NativeGraft.call(root.path, "history").getJSONArray("commits").length())
            // Single-file moves preserve record identity and bytes; relative URIs stay unchanged.
            NativeRuntime.close()
            val before = File(root, "$next/Data.eidos").readBytes()
            repository.move("$next/Data.eidos", "")
            NativeRuntime.close()
            assertArrayEquals(before, File(root, "Data.eidos").readBytes())
            assertEquals(saved.rows.single().id, repository.loadEidos("Data.eidos").rows.single().id)
            repository.close()
            val reopened = SpaceRepository(app, id)
            assertEquals(text, reopened.readText("$next/Note.md").text)
            assertEquals(saved.rows.single().id, reopened.loadEidos("Data.eidos").rows.single().id)
            reopened.close()
        } finally { repository.deleteLocalSpace(); fixture.parentFile!!.deleteRecursively() }
    }

    @Test fun draftsAndCollisionLeaveSourcesAndPreferencesIntact(): Unit = runBlocking {
        val app = compose.activity.application
        val id = SpaceCatalog(app).create("Move guards ${UUID.randomUUID()}").id
        val repository = SpaceRepository(app, id)
        try {
            repository.create("", "Target", "folder")
            val path = repository.create("", "Note", "markdown")
            val document = repository.readText(path)
            repository.saveDraft(document.copy(text = "unsaved recovery"))
            assertTrue(runCatching { repository.move(path, "Target") }.isFailure)
            assertEquals("unsaved recovery", repository.readText(path).text)
            repository.saveText(document.copy(text = "saved"))
            repository.create("Target", "Note", "markdown")
            repository.setFavorite(Favorite(path, "Note.md"), true)
            assertTrue(runCatching { repository.move(path, "Target") }.isFailure)
            assertEquals("saved", repository.readText(path).text)
            assertEquals("", repository.readText("Target/Note.md").text)
            assertEquals(path, repository.favorites().single().path)
            assertEquals(path, repository.move(path, ""))
            repository.create("", "ReadOnly", "folder")
            val directory = File(app.filesDir, "spaces/$id/ReadOnly")
            assertTrue(directory.setWritable(false, false))
            try {
                assertTrue(runCatching { repository.move(path, "ReadOnly") }.isFailure)
                assertEquals("saved", repository.readText(path).text)
                assertTrue(repository.files("ReadOnly").isEmpty())
                assertEquals(path, repository.favorites().single().path)
            } finally { directory.setWritable(true, true) }
        } finally { repository.deleteLocalSpace() }
    }

    @Test fun editorFlushesBeforeMoveAndReopensSavedContent(): Unit = runBlocking {
        val app = compose.activity.application
        val id = SpaceCatalog(app).create("Move editor ${UUID.randomUUID()}").id
        val repository = SpaceRepository(app, id)
        lateinit var model: EidosModel
        var initialized = false
        try {
            repository.create("", "Target", "folder")
            val path = repository.create("", "Draft", "markdown")
            repository.saveText(repository.readText(path).copy(text = "# Initial\n"))
            compose.runOnUiThread { model = EidosModel(app, repository); initialized = true; compose.activity.setContent { EidosApp(model) } }
            idle(model)
            compose.runOnUiThread { model.open(SpaceFile(path, "Draft.md", false, 0, 0)) }
            waitJs("document.querySelector('.eme-content-editable h1')?.textContent === 'Initial' && typeof window.eidosFlush === 'function'")
            compose.waitUntil(15_000) { compose.onAllNodes(hasContentDescription(tr("文件操作")) and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
            js("""(() => { const root = document.querySelector('.eme-content-editable'); root.focus();
                const range = document.createRange(); range.selectNodeContents(root.querySelector('h1'));
                getSelection().removeAllRanges(); getSelection().addRange(range);
                requestAnimationFrame(() => requestAnimationFrame(() => window.moveInputReady = true)); })()""")
            waitJs("window.moveInputReady === true && getSelection()?.toString() === 'Initial'")
            js("document.execCommand('insertText', false, 'Latest offline content')")
            waitJs("document.querySelector('.eme-content-editable')?.textContent.includes('Latest offline content')")
            compose.onNodeWithContentDescription(tr("文件操作")).performClick()
            compose.onNodeWithText(tr("移动到…")).performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithTag("move-file-sheet").fetchSemanticsNodes().isNotEmpty() }
            selectFolder("Target")
            confirmMove()
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.webFile?.path == "Target/Draft.md" }
            waitJs("document.querySelector('.eme-content-editable')?.textContent.includes('Latest offline content')")
            assertTrue(repository.readText("Target/Draft.md").text.contains("Latest offline content"))
            assertFalse(File(app.filesDir, "spaces/$id/Draft.md").exists())
            compose.onNodeWithContentDescription(tr("返回文件")).performClick()
            compose.waitUntil(10_000) { model.state.value.webFile == null && !model.state.value.busy }
            compose.runOnUiThread { compose.activity.setContent {}; model.viewModelScope.cancel() }
            repository.close()
            compose.runOnUiThread { model = EidosModel(app, SpaceRepository(app, id)); compose.activity.setContent { EidosApp(model) } }
            idle(model)
            compose.runOnUiThread { model.open(SpaceFile("Target/Draft.md", "Draft.md", false, 0, 0)) }
            waitJs("document.querySelector('.eme-content-editable')?.textContent.includes('Latest offline content')")
            screenshot(app, "move-401-editor-reopen.png")
            assertNull(model.state.value.error)
        } finally {
            compose.runOnUiThread { compose.activity.setContent {}; if (initialized) model.viewModelScope.cancel() }
            repository.deleteLocalSpace()
        }
    }

    @Test fun failedPreferenceWriteRollsBackFileAndLocalPaths(): Unit = runBlocking {
        val app = compose.activity.application
        val id = SpaceCatalog(app).create("Move persistence ${UUID.randomUUID()}").id
        val repository = SpaceRepository(app, id)
        val preferences = app.getSharedPreferences("space-$id", 0)
        val directory = File(app.applicationInfo.dataDir, "shared_prefs")
        try {
            repository.create("", "Target", "folder")
            val path = repository.create("", "Note", "markdown")
            repository.saveText(repository.readText(path).copy(text = "keep file and paths"))
            repository.setFavorite(Favorite(path, "Note.md"), true)
            assertTrue(preferences.edit().putString("recent", JSONArray(listOf(path)).toString()).commit())
            assertTrue(directory.setWritable(false, false))
            try {
                assertTrue(runCatching { repository.move(path, "Target") }.isFailure)
                assertTrue(File(app.filesDir, "spaces/$id/$path").exists())
                assertFalse(File(app.filesDir, "spaces/$id/Target/$path").exists())
                assertEquals(path, repository.favorites().single().path)
                assertEquals(path, repository.recent().single().path)
            } finally { directory.setWritable(true, true) }
        } finally { directory.setWritable(true, true); repository.deleteLocalSpace() }
    }

    @Test fun nativeMovePickerCancelsRejectsCollisionAndReturnsFileToRoot(): Unit = runBlocking {
        val app = compose.activity.application
        val id = SpaceCatalog(app).create("Move UI ${UUID.randomUUID()}").id
        val repository = SpaceRepository(app, id)
        lateinit var model: EidosModel
        var initialized = false
        try {
            repository.create("", "Target", "folder")
            repository.create("", "Blocked", "folder")
            repository.create("", "Note", "markdown")
            repository.create("Blocked", "Note", "markdown")
            repository.saveText(repository.readText("Note.md").copy(text = "# preserved\n"))
            compose.runOnUiThread { model = EidosModel(app, repository); initialized = true; compose.activity.setContent { EidosApp(model) } }
            idle(model)
            fun picker() {
                compose.onAllNodesWithContentDescription(tr("更多 {0}", "Note.md"))[0].performClick()
                compose.onNodeWithText(tr("移动到…")).performClick()
                compose.waitUntil(5000) { compose.onAllNodesWithTag("move-file-sheet").fetchSemanticsNodes().isNotEmpty() }
            }
            picker()
            compose.onNodeWithText(tr("移动到此处")).assertIsNotEnabled()
            compose.onNodeWithContentDescription(tr("取消")).performClick()
            assertEquals("# preserved\n", repository.readText("Note.md").text)
            picker()
            selectFolder("Blocked")
            confirmMove()
            compose.waitUntil(5000) { model.state.value.error != null }
            compose.onNodeWithText(tr("名称已存在")).assertIsDisplayed()
            compose.onNodeWithText(tr("知道了")).performClick()
            assertEquals("# preserved\n", repository.readText("Note.md").text)
            compose.onNodeWithText(tr("Space 根目录")).performClick()
            selectFolder("Target")
            compose.onNodeWithText(tr("单独移动文件可能使相对链接和附件失效。移动整个文件夹可保留内部相对关系。")).assertIsDisplayed()
            screenshot(app, "move-401-picker.png")
            confirmMove()
            compose.waitUntil(5000) { !model.state.value.busy && model.state.value.files.none { it.path == "Note.md" } }
            compose.onNode(hasText("Target") and hasClickAction()).performClick()
            compose.waitUntil(5000) { !model.state.value.busy && model.state.value.folder == "Target" }
            picker()
            compose.onNodeWithText(tr("Space 根目录")).performClick()
            confirmMove()
            idle(model)
            assertEquals("# preserved\n", repository.readText("Note.md").text)
            assertTrue(repository.files("Target").isEmpty())
            // Repeat the picker in English without changing its navigation behavior.
            compose.runOnUiThread { AppLanguage.set(app, "en"); model.back() }
            idle(model)
            picker()
            compose.onNodeWithText("Move here").assertIsDisplayed()
            screenshot(app, "move-401-picker-en.png")
            compose.onNodeWithContentDescription("Cancel").performClick()
        } finally {
            compose.runOnUiThread { compose.activity.setContent {}; if (initialized) model.viewModelScope.cancel(); AppLanguage.set(app, "zh") }
            repository.deleteLocalSpace()
        }
    }

    private fun idle(model: EidosModel) { compose.waitUntil(15_000) { !model.state.value.busy }; compose.waitForIdle() }
    private fun selectFolder(name: String) {
        val match = hasText(name) and hasClickAction() and hasAnyAncestor(hasTestTag("move-file-sheet"))
        compose.waitUntil(5000) { compose.onAllNodes(match).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(match).performClick()
    }
    private fun confirmMove() {
        val match = hasText(tr("移动到此处")) and isEnabled()
        compose.waitUntil(5000) { compose.onAllNodes(match).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(match).performClick()
    }
    private fun js(script: String): String {
        fun find(view: View): WebView? {
            if (view is WebView) return view
            if (view is ViewGroup) for (index in 0 until view.childCount) find(view.getChildAt(index))?.let { return it }
            return null
        }
        val latch = CountDownLatch(1)
        var result = ""
        compose.runOnUiThread { checkNotNull(find(compose.activity.window.decorView)).evaluateJavascript(script) { result = it; latch.countDown() } }
        check(latch.await(10, TimeUnit.SECONDS))
        return result
    }
    private fun waitJs(condition: String) {
        try { compose.waitUntil(15_000) { runCatching { js(condition) == "true" }.getOrDefault(false) } }
        catch (failure: androidx.compose.ui.test.ComposeTimeoutException) {
            throw AssertionError(condition + "\n" + js("JSON.stringify({html:document.querySelector('.eme-content-editable')?.innerHTML,focus:document.activeElement?.outerHTML})"), failure)
        }
    }
    private fun screenshot(app: android.content.Context, name: String) {
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(app.cacheDir, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
}
