package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Rule
import org.junit.Test

class CloneSpaceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun retriesFailedDownloadAndMaterializesCompleteSpace(): Unit = runBlocking {
        val base = InstrumentationRegistry.getArguments().getString("graftRemoteUrl")
        Assume.assumeNotNull(base)
        val app = compose.activity.application
        val suffix = UUID.randomUUID().toString()
        val catalog = SpaceCatalog(app)
        val original = catalog.activeId()
        val sourceId = "clone-source-$suffix"
        val currentId = "clone-current-$suffix"
        val source = SpaceRepository(app, sourceId)
        val current = SpaceRepository(app, currentId)
        val markdown = source.create("", "笔记", "markdown")
        source.saveText(source.readText(markdown).copy(text = "# 完整的离线资料"))
        val database = source.create("", "记录", "eidos")
        val empty = source.loadEidos(database)
        val label = checkNotNull(empty.table).labelFieldId
        source.mutate(empty, null, mapOf(label to "远程记录"))
        val bytes = ByteArray(65536) { (it % 251).toByte() }
        File(app.filesDir, "spaces/$sourceId/附件.bin").writeBytes(bytes)
        val url = "$base/android/clone-$suffix"
        source.connectRemote(url, "ephemeral-test-token")
        source.syncRemote(publish = true)
        val protected = current.create("", "当前资料", "markdown")
        current.saveText(current.readText(protected).copy(text = "保留本地资料"))
        var model: EidosModel? = null
        val received = java.util.concurrent.atomic.AtomicLong(0)
        var progressJob: Job? = null
        val name = "下载副本-$suffix"
        try {
            compose.runOnUiThread {
                val isolated = EidosModel(app, current)
                model = isolated
                compose.activity.setContent { EidosApp(isolated) }
            }
            compose.waitUntil(15_000) { model?.state?.value?.busy == false }
            progressJob =
                launch(Dispatchers.Default) {
                    model!!.state.collect { state ->
                        state.downloadProgress?.let { progress ->
                            received.updateAndGet { maxOf(it, progress.receivedBytes) }
                        }
                    }
                }
            val before = File(app.filesDir, "spaces").list()!!.toSet()
            compose.onNodeWithContentDescription("切换 Space").performClick()
            compose.onNodeWithText("高级：手动下载远程 Space").performClick()
            compose.onNodeWithText("Space 名称").performTextInput(name)
            compose.onNodeWithText("远程地址").performTextInput(url)
            compose.onNodeWithText("访问令牌（可选）").performTextInput("wrong-token")
            compose.onNodeWithText("下载到本机").performScrollTo().performClick()
            compose.waitUntil(30_000) {
                model?.state?.value?.error != null && model?.state?.value?.busy == false
            }
            assertEquals(currentId, model!!.repository.spaceId)
            assertNull(model!!.state.value.downloadProgress)
            assertEquals(before, File(app.filesDir, "spaces").list()!!.toSet())
            assertFalse(catalog.spaces().any { it.name == name })
            compose.onNodeWithText("知道了").performClick()
            compose.onNodeWithText("访问令牌（可选）").performTextReplacement("ephemeral-test-token")
            compose.onNodeWithText("下载到本机").performScrollTo().performClick()
            compose.waitUntil(30_000) {
                model?.state?.value?.spaceName == name && model?.state?.value?.busy == false
            }
            val downloaded = model!!.repository
            assertTrue("Native download must report received bytes", received.get() > 0)
            assertNull(model!!.state.value.downloadProgress)
            assertEquals("# 完整的离线资料", downloaded.readText(markdown).text)
            assertEquals("远程记录", downloaded.loadEidos(database).rows.single().values[label])
            assertArrayEquals(
                bytes,
                File(app.filesDir, "spaces/${downloaded.spaceId}/附件.bin").readBytes(),
            )
            assertEquals("保留本地资料", current.readText(protected).text)
            assertEquals(url, downloaded.graftStatus().remoteUrl)
            assertEquals("synced", downloaded.syncRemote())
            assertEquals(downloaded.spaceId, SpaceCatalog(app).activeId())
        } finally {
            progressJob?.cancelAndJoin()
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            val cloned = catalog.spaces().filter { it.name == name }
            catalog.select(original)
            val prefs =
                app.getSharedPreferences("space-catalog", android.content.Context.MODE_PRIVATE)
            val saved = JSONArray(prefs.getString("spaces", "[]"))
            prefs
                .edit()
                .putString(
                    "spaces",
                    JSONArray(
                            (0 until saved.length()).map(saved::getJSONObject).filter { entry ->
                                cloned.none { it.id == entry.getString("id") }
                            }
                        )
                        .toString(),
                )
                .commit()
            cloned.forEach { SpaceRepository(app, it.id).discardPendingClone() }
            source.disconnectRemote()
            listOf(sourceId, currentId).forEach {
                SpaceRepository(app, it).close()
                File(app.filesDir, "spaces/$it").deleteRecursively()
            }
        }
    }
}
