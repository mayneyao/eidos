package space.eidos.android

import android.content.Intent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class ShareFilesTest {
    @get:Rule val compose = createEmptyComposeRule()

    @Test
    fun importsBinaryFilesWithoutOverwriteAndHandlesRealMultipleShareIntent(): Unit = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "share-${UUID.randomUUID()}"
        val fixture = File(app.cacheDir, "test-share/$id").apply { mkdirs() }
        val name = "$id.png"
        val a =
            File(fixture, "a/$name").apply {
                parentFile!!.mkdirs()
                writeBytes(byteArrayOf(0, 1, 2, -1))
            }
        val b =
            File(fixture, "b/$name").apply {
                parentFile!!.mkdirs()
                writeBytes(byteArrayOf(9, 8, 7))
            }
        fun uri(file: File) = FileProvider.getUriForFile(app, "${app.packageName}.testshare", file)
        val repository = SpaceRepository(app, id)
        val root = File(app.filesDir, "spaces/$id")
        val activeId = SpaceCatalog(app).activeId()
        val active = SpaceRepository(app, activeId)
        val activeRoot = File(app.filesDir, "spaces/$activeId")
        val prefs =
            app.getSharedPreferences(
                if (activeId == "personal") "space" else "space-$activeId",
                android.content.Context.MODE_PRIVATE,
            )
        val previousFolder = prefs.getString("share.folder", null)
        val destination = active.create("", "分享目标-$id", "folder")
        try {
            assertTrue(repository.shareFolders("").any { it.path == "收件箱" })
            assertFalse(File(root, "收件箱").exists())
            val removed = repository.create("", "临时目标", "folder")
            repository.rememberShareFolder(removed)
            assertEquals(removed, SpaceRepository(app, id).shareFolder())
            assertTrue(File(root, removed).delete())
            assertEquals("收件箱", SpaceRepository(app, id).shareFolder())
            assertTrue(runCatching { repository.capture("不应写入", removed) }.isFailure)
            val captured =
                repository.captureFiles(listOf(uri(a), uri(b), uri(File(fixture, "missing.png"))))
            assertEquals(2, captured.paths.size)
            assertEquals(1, captured.failures.size)
            assertArrayEquals(a.readBytes(), File(root, captured.paths[0]).readBytes())
            assertArrayEquals(b.readBytes(), File(root, captured.paths[1]).readBytes())
            assertTrue(captured.paths[1].endsWith(" (2).png"))
            assertEquals(
                1,
                repository.captureFiles(listOf(android.net.Uri.fromFile(a))).failures.size,
            )
            val rootCopies = repository.captureFiles(listOf(uri(a), uri(b)), "")
            assertTrue(rootCopies.failures.isEmpty())
            assertEquals(listOf(name, "$id (2).png"), rootCopies.paths)
            assertArrayEquals(b.readBytes(), File(root, rootCopies.paths[1]).readBytes())
            prefs.edit().remove("share.folder").commit()
            val intent =
                Intent(app, MainActivity::class.java).apply {
                    action = Intent.ACTION_SEND_MULTIPLE
                    type = "image/png"
                    putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(uri(a), uri(b)))
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    clipData =
                        android.content.ClipData.newRawUri("images", uri(a)).apply {
                            addItem(android.content.ClipData.Item(uri(b)))
                        }
                }
            ActivityScenario.launch<MainActivity>(intent).use { scenario ->
                lateinit var model: EidosModel
                scenario.onActivity { model = ViewModelProvider(it)[EidosModel::class.java] }
                withTimeout(15_000) {
                    model.state.first { !it.busy && it.pendingShares.isNotEmpty() }
                }
                assertFalse(File(activeRoot, "收件箱/$name").exists())
                scenario.recreate()
                scenario.onActivity { model = ViewModelProvider(it)[EidosModel::class.java] }
                assertEquals(1, model.state.value.pendingShares.size)
                compose.onNodeWithContentDescription("选择上级文件夹").performClick()
                compose.onNodeWithTag("share-folders").performScrollToNode(hasText(destination))
                compose
                    .onNode(hasText(destination) and hasAnyAncestor(hasTestTag("share-folders")))
                    .performClick()
                compose.onNodeWithText("保存到此文件夹").performClick()
                val state =
                    withTimeout(15_000) {
                        model.state.first { !it.busy && it.captureNotice != null }
                    }
                assertNull(state.error)
                assertEquals(destination, state.folder)
                assertEquals(2, state.files.count { it.name.startsWith(id) })
                assertArrayEquals(a.readBytes(), File(activeRoot, "$destination/$name").readBytes())
                scenario.recreate()
                scenario.onActivity { model = ViewModelProvider(it)[EidosModel::class.java] }
                assertEquals(2, active.files(destination).count { it.name.startsWith(id) })
                assertEquals(destination, SpaceRepository(app, activeId).shareFolder())
                scenario.onActivity { activity ->
                    activity.startActivity(
                        Intent(activity, MainActivity::class.java).apply {
                            action = Intent.ACTION_SEND
                            type = "text/plain"
                            putExtra(Intent.EXTRA_SUBJECT, "值得读的文章")
                            putExtra(Intent.EXTRA_TEXT, "https://example.org/分享")
                            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        }
                    )
                }
                withTimeout(15_000) {
                    model.state.first { !it.busy && it.pendingShares.isNotEmpty() }
                }
                assertEquals(destination, model.state.value.shareFolder)
                scenario.onActivity { model.receiveShare(emptyList(), "稍后处理的第二条分享") }
                withTimeout(15_000) { model.state.first { !it.busy && it.pendingShares.size == 2 } }
                compose.onNodeWithText("保存到此文件夹").performClick()
                withTimeout(15_000) { model.state.first { !it.busy && it.pendingShares.size == 1 } }
                assertEquals("稍后处理的第二条分享", model.state.value.pendingShares.single().text)
                scenario.onActivity { model.cancelShare() }
                withTimeout(15_000) { model.state.first { !it.busy && it.pendingShares.isEmpty() } }
                assertTrue(ShareInbox(app, activeId).pending().isEmpty())
                val note = active.files(destination).single { it.markdown }
                assertEquals("值得读的文章\n\nhttps://example.org/分享", active.readText(note.path).text)
            }
        } finally {
            root.deleteRecursively()
            fixture.deleteRecursively()
            File(activeRoot, destination).deleteRecursively()
            prefs
                .edit()
                .apply {
                    if (previousFolder == null) remove("share.folder")
                    else putString("share.folder", previousFolder)
                }
                .commit()
        }
    }
}
