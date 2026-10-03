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

class FileImportReturnTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun pickerResultDuringForegroundRefreshIsImportedAndFailuresAreVisible() {
        val app = compose.activity.application
        val id = "import-return-${UUID.randomUUID()}"
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val fixture =
            File(app.cacheDir, "test-share/$id/note.md").apply {
                parentFile!!.mkdirs()
                writeText("# Imported locally\n")
            }
        val uri = FileProvider.getUriForFile(app, "${app.packageName}.testshare", fixture)
        lateinit var model: EidosModel
        try {
            compose.runOnUiThread { model = EidosModel(app, repository) }
            compose.waitUntil(15_000) { !model.state.value.busy }
            compose.runOnUiThread {
                model.foregroundStarted()
                assertTrue(model.state.value.busy)
                model.import(uri)
            }
            compose.waitUntil(15_000) {
                !model.state.value.busy && model.state.value.files.any { it.name == "note.md" }
            }
            assertEquals(fixture.readText(), File(root, "note.md").readText())
            assertNotNull(model.state.value.captureNotice)
            compose.runOnUiThread { model.import(uri) }
            compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.error != null }
            assertTrue(model.state.value.error!!.contains("同名文件"))
            assertEquals(fixture.readText(), File(root, "note.md").readText())
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            root.deleteRecursively()
            fixture.parentFile!!.deleteRecursively()
        }
    }
}
