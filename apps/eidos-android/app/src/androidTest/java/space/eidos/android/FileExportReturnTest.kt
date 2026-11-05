package space.eidos.android

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.content.FileProvider
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class FileExportReturnTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun pickerOriginCannotExportTheSamePathFromAnotherSpace() {
        val app = compose.activity.application
        val id = "export-other-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val destination = File(app.cacheDir, "test-share/$id/export.md").apply {
            parentFile!!.mkdirs()
            writeText("Destination unchanged")
        }
        val uri = FileProvider.getUriForFile(app, "${app.packageName}.testshare", destination)
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread { model = EidosModel(app, repository) }
            compose.waitUntil(15_000) { !model.state.value.busy }
            File(root, "note.md").writeText("Other Space content must not be exported")
            compose.runOnUiThread { model.export("note.md", uri, "export-origin-${UUID.randomUUID()}") }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.error != null }
            assertEquals("Destination unchanged", destination.readText())
            assertTrue(model.state.value.error!!.contains("Space"))
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            destination.parentFile!!.deleteRecursively()
        }
    }

    @Test
    fun pickerResultDuringForegroundRefreshExportsEveryByte() {
        val app = compose.activity.application
        val id = "export-return-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val destination = File(app.cacheDir, "test-share/$id/export.md").apply {
            parentFile!!.mkdirs()
            writeText("")
        }
        val uri = FileProvider.getUriForFile(app, "${app.packageName}.testshare", destination)
        val content = "# Exported locally\n\nKeep every byte.\n"
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread { model = EidosModel(app, repository) }
            compose.waitUntil(15_000) { !model.state.value.busy }
            File(root, "note.md").writeText(content)
            compose.runOnUiThread {
                model.foregroundStarted()
                assertTrue(model.state.value.busy)
                model.export("note.md", uri)
            }
            compose.waitUntil(15_000) {
                !model.state.value.busy && destination.readText() == content
            }
            assertEquals(content, destination.readText())
            assertNull(model.state.value.error)
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            destination.parentFile!!.deleteRecursively()
        }
    }
}
