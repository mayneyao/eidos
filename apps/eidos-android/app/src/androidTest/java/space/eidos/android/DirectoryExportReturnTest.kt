package space.eidos.android

import android.provider.DocumentsContract
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Hold the real repository IO boundary without adding a production test hook. */
internal class ForegroundExportIoBlocker {
    private val entered = CountDownLatch(1)
    private val release = CountDownLatch(1)
    @Volatile private var armed = false
    private var staging: File? = null
    private var stagingBefore = emptySet<String>()
    val storageSpace = StorageSpace { directory ->
        if (armed) {
            staging = directory
            stagingBefore = directory.list()!!.toSet()
            entered.countDown()
            check(release.await(30, TimeUnit.SECONDS)) { "Timed out holding the repository IO boundary" }
            0L // Reject the controlled write before it creates any file.
        } else Long.MAX_VALUE
    }

    suspend fun whileHoldingIo(repository: SpaceRepository, root: File, action: () -> Unit): Unit = coroutineScope {
        armed = true
        val name = "blocked-${UUID.randomUUID()}"
        val write = async(Dispatchers.IO) {
            runCatching { repository.create("", name, "markdown") }
        }
        try {
            check(entered.await(15, TimeUnit.SECONDS)) { "The controlled write never acquired repository IO" }
            action()
        } finally {
            withContext(NonCancellable) {
                release.countDown()
                try {
                    val failure = write.await().exceptionOrNull()
                    check(failure is IOException) { "The controlled write must fail its preflight: $failure" }
                    check(!File(root, "$name.md").exists()) { "The controlled write left a file behind" }
                    check(staging?.list()?.toSet() == stagingBefore) { "The controlled write left staging files behind" }
                } finally {
                    armed = false
                }
            }
        }
    }
}

internal fun exportStateDescription(model: EidosModel): String {
    val state = model.state.value
    return "busy=${state.busy}, peerBusy=${state.peerBusy}, owner=${model.repository.spaceId}, " +
        "space=${state.spaceId}, notice=${state.captureNotice}, error=${state.error}"
}

internal fun waitForExportState(compose: ComposeTestRule, model: EidosModel, condition: () -> Boolean) {
    try {
        compose.waitUntil(15_000, condition)
    } catch (error: Throwable) {
        throw AssertionError("Export state did not become ready: ${exportStateDescription(model)}", error)
    }
}

class DirectoryExportReturnTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun pickerResultDuringForegroundRefreshExportsTheCompleteDirectory(): Unit = runBlocking {
        val app = compose.activity.application
        val id = "directory-export-return-${UUID.randomUUID()}"
        val blocker = ForegroundExportIoBlocker()
        val repository = SpaceRepository(app, id, blocker.storageSpace)
        val root = File(app.filesDir, "spaces/$id")
        val output = File(app.cacheDir, "test-tree/$id/output").apply { mkdirs() }
        val uri = DocumentsContract.buildTreeDocumentUri("${app.packageName}.testtree", "$id/output")
        val markdown = "# Directory export\n\n![Attachment](assets/photo.bin)\n"
        val bytes = byteArrayOf(0, 1, -1, 8)
        var model: EidosModel? = null
        try {
            val database = repository.create("", "records", "eidos")
            val page = repository.loadEidos(database)
            val label = page.table!!.labelFieldId
            repository.mutate(page, null, mapOf(label to "Directory export record"))
            repository.loadEidos(database) // Export must close the live Runtime session safely.
            File(root, "note.md").writeText(markdown)
            File(root, "assets").mkdir()
            File(root, "assets/photo.bin").writeBytes(bytes)
            File(root, "empty").mkdir()
            compose.runOnUiThread { model = EidosModel(app, repository) }
            val exporting = checkNotNull(model)
            compose.waitUntil(15_000) { !exporting.state.value.busy }
            blocker.whileHoldingIo(repository, root) {
                compose.runOnUiThread { exporting.foregroundStarted() }
                waitForExportState(compose, exporting) { exporting.state.value.busy }
                compose.runOnUiThread {
                    assertTrue("The picker result must arrive during held foreground refresh: ${exportStateDescription(exporting)}", exporting.state.value.busy)
                    exporting.exportDirectory("", uri)
                }
            }
            waitForExportState(compose, exporting) {
                !exporting.state.value.busy && exporting.state.value.captureNotice != null
            }
            assertNull(exporting.state.value.error)
            val exported = File(output, id)
            assertEquals(markdown, File(exported, "note.md").readText())
            assertArrayEquals(bytes, File(exported, "assets/photo.bin").readBytes())
            assertTrue(File(exported, "empty").isDirectory)
            assertFalse(File(exported, ".graft").exists())
            val imported = repository.importDirectory(
                DocumentsContract.buildTreeDocumentUri("${app.packageName}.testtree", "$id/output/$id"),
                "",
            )
            assertEquals("Directory export record", repository.loadEidos("$imported/$database").rows.single().values[label])
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            repository.close()
            root.deleteRecursively()
            output.parentFile!!.deleteRecursively()
        }
    }
}
