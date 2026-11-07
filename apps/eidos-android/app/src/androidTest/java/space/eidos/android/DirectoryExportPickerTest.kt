package space.eidos.android

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.compose.LocalActivityResultRegistryOwner
import androidx.activity.compose.setContent
import androidx.activity.result.ActivityResultRegistry
import androidx.activity.result.ActivityResultRegistryOwner
import androidx.activity.result.contract.ActivityResultContract
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.core.app.ActivityOptionsCompat
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class DirectoryExportPickerTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    private class PickerRegistry : ActivityResultRegistry(), ActivityResultRegistryOwner {
        override val activityResultRegistry: ActivityResultRegistry get() = this
        private var requestCode: Int? = null

        override fun <I, O> onLaunch(
            requestCode: Int,
            contract: ActivityResultContract<I, O>,
            input: I,
            options: ActivityOptionsCompat?,
        ) {
            this.requestCode = requestCode
        }

        fun returnTree(uri: Uri?, resultCode: Int = if (uri == null) Activity.RESULT_CANCELED else Activity.RESULT_OK) {
            val code = checkNotNull(requestCode) { "No directory picker was launched" }
            requestCode = null
            dispatchResult(code, resultCode, uri?.let { Intent().setData(it) })
        }
    }

    private fun withFixture(test: (EidosModel, LocalSpace, PickerRegistry, Uri, File) -> Unit): Unit = runBlocking {
        val app = compose.activity.application
        val catalog = SpaceCatalog(app)
        val original = catalog.activeId()
        val suffix = UUID.randomUUID().toString()
        val first = catalog.create("Export origin $suffix")
        val second = catalog.create("Export other $suffix")
        val repository = SpaceRepository(app, first.id)
        val fixture = File(app.cacheDir, "test-tree/export-picker-$suffix").apply { mkdirs() }
        val output = File(fixture, "output").apply { mkdir() }
        val uri = DocumentsContract.buildTreeDocumentUri("${app.packageName}.testtree", "${fixture.name}/output")
        val picker = PickerRegistry()
        var model: EidosModel? = null
        try {
            listOf(first to "Original Space", second to "Other Space").forEach { (space, content) ->
                val root = File(app.filesDir, "spaces/${space.id}").apply { mkdirs() }
                File(root, "picked").mkdir()
                File(root, "picked/note.md").writeText(content)
                File(root, "not-selected.md").writeText("Only the selected folder may be exported")
            }
            compose.runOnUiThread {
                val isolated = EidosModel(app, repository)
                model = isolated
                compose.activity.setContent {
                    CompositionLocalProvider(LocalActivityResultRegistryOwner provides picker) {
                        EidosApp(isolated)
                    }
                }
            }
            val exporting = checkNotNull(model)
            compose.waitUntil(15_000) { !exporting.state.value.busy }
            val folder = repository.file("picked")
            compose.runOnUiThread { exporting.open(folder) }
            compose.waitUntil(15_000) { !exporting.state.value.busy && exporting.state.value.folder == "picked" }
            test(exporting, second, picker, uri, output)
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            model?.repository?.close()
            repository.close()
            catalog.select(original)
            listOf(first, second).forEach { space ->
                catalog.removeLocal(space.id)
                File(app.filesDir, "spaces/${space.id}").deleteRecursively()
                File(app.filesDir, "staging/${space.id}").deleteRecursively()
                app.deleteSharedPreferences("space-${space.id}")
            }
            fixture.deleteRecursively()
        }
    }

    private fun launchPicker() {
        compose.onNodeWithContentDescription("当前文件夹操作").performClick()
        compose.onNodeWithText("导出当前目录").performClick()
    }

    @Test
    fun changingSpaceBeforePickerReturnsDoesNotExportTheNewSpace() = withFixture { model, second, picker, uri, output ->
        launchPicker()
        compose.runOnUiThread { model.switchSpace(second.id) }
        compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.spaceId == second.id }
        compose.runOnUiThread { picker.returnTree(uri) }
        compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.error != null }
        assertTrue(model.state.value.error!!.contains("Space"))
        assertTrue(output.list()!!.isEmpty())
        assertNull(model.state.value.captureNotice)
    }

    @Test
    fun changingSpaceWhilePickerResultWaitsDoesNotExportEitherSpace() = withFixture { model, second, picker, uri, output ->
        launchPicker()
        val original = model.state.value.spaceId
        compose.runOnUiThread {
            model.switchSpace(second.id)
            assertTrue(model.state.value.busy)
            assertEquals(original, model.repository.spaceId)
            picker.returnTree(uri)
        }
        compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.error != null }
        assertEquals(second.id, model.state.value.spaceId)
        assertTrue(model.state.value.error!!.contains("Space"))
        assertTrue(output.list()!!.isEmpty())
        assertNull(model.state.value.captureNotice)
    }

    private fun emptyPickerResultAllowsFreshSelection(resultCode: Int) = withFixture { model, second, picker, uri, output ->
        launchPicker()
        compose.runOnUiThread { picker.returnTree(null, resultCode) }
        compose.waitForIdle()
        assertNull(model.state.value.error)
        assertNull(model.state.value.captureNotice)
        assertTrue(output.list()!!.isEmpty())
        compose.runOnUiThread { model.switchSpace(second.id) }
        compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.spaceId == second.id }
        val folder = runBlocking { model.repository.file("picked") }
        compose.runOnUiThread { model.open(folder) }
        compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.folder == "picked" }
        launchPicker()
        compose.runOnUiThread { picker.returnTree(uri) }
        compose.waitUntil(15_000) { !model.state.value.busy && model.state.value.captureNotice != null }
        assertNull(model.state.value.error)
        assertEquals("Other Space", File(output, "picked/note.md").readText())
        assertFalse(File(output, "not-selected.md").exists())
        assertEquals(setOf("picked"), output.list()!!.toSet())
    }

    @Test
    fun cancellingPickerAllowsAFreshSelectionFromAnotherSpace() =
        emptyPickerResultAllowsFreshSelection(Activity.RESULT_CANCELED)

    @Test
    fun pickerWithoutUriAllowsAFreshSelectionFromAnotherSpace() =
        emptyPickerResultAllowsFreshSelection(Activity.RESULT_OK)
}
