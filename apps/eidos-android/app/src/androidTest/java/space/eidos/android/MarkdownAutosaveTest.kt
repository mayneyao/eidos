package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class MarkdownAutosaveTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun commitsWithoutLeavingEditorAndPreservesExternalChanges(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "autosave-${UUID.randomUUID()}"
        val repo = SpaceRepository(app, id)
        val path = repo.create("", "自动保存", "markdown")
        val file = File(app.filesDir, "spaces/$id/$path")
        val model = withContext(Dispatchers.Main) { EidosModel(app, repo) }
        try {
            compose.runOnUiThread { compose.activity.setContent { EidosApp(model) } }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.spaceId == id }
            compose.onAllNodesWithText(path).onFirst().performClick()
            compose.waitUntil(15_000) {
                model.state.value.document != null && !model.state.value.busy
            }
            compose.onNodeWithContentDescription("编辑").performClick()
            compose.runOnUiThread { model.textChanged("第一段") }
            compose.waitUntil(15_000) { !model.state.value.dirty && file.readText() == "第一段" }
            assertTrue(model.state.value.editing)
            compose.runOnUiThread { model.textChanged("第二段") }
            compose.waitUntil(15_000) { !model.state.value.dirty && file.readText() == "第二段" }
            assertNull(model.state.value.error)
            // A new edit must use the digest returned by the preceding auto-save.
            compose.runOnUiThread {
                model.textChanged("返回时保存")
                model.back()
            }
            compose.waitUntil(15_000) {
                model.state.value.document == null && !model.state.value.busy
            }
            assertEquals("返回时保存", file.readText())
            compose.onAllNodesWithText(path).onFirst().performClick()
            compose.waitUntil(15_000) {
                model.state.value.document != null && !model.state.value.busy
            }
            compose.onNodeWithContentDescription("编辑").performClick()
            file.writeText("外部的新版本")
            compose.runOnUiThread { model.textChanged("保留我的草稿") }
            compose.waitUntil(15_000) { model.state.value.error != null }
            assertEquals("外部的新版本", file.readText())
            assertTrue(model.state.value.dirty)
            assertEquals("保留我的草稿", repo.readText(path).text)
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            repo.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
