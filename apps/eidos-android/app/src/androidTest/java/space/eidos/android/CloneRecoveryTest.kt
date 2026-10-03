package space.eidos.android

import android.content.Context
import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Rule
import org.junit.Test

class CloneRecoveryTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun cancelledDownloadRetainsRecoveryAndEncryptedProfile(): Unit = runBlocking {
        val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        val received = CountDownLatch(1)
        val release = CountDownLatch(1)
        val thread =
            Thread {
                    try {
                        server.accept().use { socket ->
                            socket.soTimeout = 10_000
                            socket.getInputStream().bufferedReader().readLine()
                            received.countDown()
                            release.await(15, TimeUnit.SECONDS)
                        }
                    } catch (_: Exception) {}
                }
                .apply { start() }
        val task =
            launch(Dispatchers.IO) {
                CloneJournal(context)
                    .download(
                        "中断-${UUID.randomUUID()}",
                        "http://127.0.0.1:${server.localPort}/test/clone",
                        "private-test-token",
                    )
            }
        try {
            assertTrue(received.await(10, TimeUnit.SECONDS))
            task.cancel()
            withTimeout(5_000) { task.join() }
            val pending = checkNotNull(CloneJournal(context).pending())
            assertFalse(pending.ready)
            assertFalse(SpaceCatalog(context).spaces().any { it.id == pending.space.id })
            assertEquals(
                "private-test-token",
                SyncProfileStore(context, pending.space.id).load()?.token,
            )
            assertFalse(
                context
                    .getSharedPreferences("pending-clone", Context.MODE_PRIVATE)
                    .getString("job", "")!!
                    .contains("private-test-token")
            )
        } finally {
            release.countDown()
            server.close()
            withContext(NonCancellable) { task.cancelAndJoin() }
            thread.join(2_000)
            CloneJournal(context).pending()?.let { cleanup(it.space) }
        }
    }

    private fun journal(space: LocalSpace, ready: Boolean) {
        assertTrue(
            context
                .getSharedPreferences("pending-clone", Context.MODE_PRIVATE)
                .edit()
                .putString(
                    "job",
                    JSONObject()
                        .put("id", space.id)
                        .put("name", space.name)
                        .put("ready", ready)
                        .toString(),
                )
                .commit()
        )
    }

    private suspend fun cleanup(space: LocalSpace) {
        val prefs = context.getSharedPreferences("space-catalog", Context.MODE_PRIVATE)
        val saved = JSONArray(prefs.getString("spaces", "[]"))
        prefs
            .edit()
            .putString(
                "spaces",
                JSONArray(
                        (0 until saved.length()).map(saved::getJSONObject).filter {
                            it.getString("id") != space.id
                        }
                    )
                    .toString(),
            )
            .commit()
        CloneJournal(context)
            .pending()
            ?.takeIf { it.space.id == space.id }
            ?.let { CloneJournal(context).discard(space.id) }
        SpaceRepository(context, space.id).discardPendingClone()
    }

    @Test
    fun readyRegistrationSurvivesRecreationAndNeverDeletesRegisteredFiles(): Unit = runBlocking {
        val space = SpaceCatalog(context).prepare("恢复-${UUID.randomUUID()}")
        val repo = SpaceRepository(context, space.id)
        val original = SpaceCatalog(context).activeId()
        var model: EidosModel? = null
        try {
            val path = repo.create("", "离线资料", "markdown")
            repo.saveText(repo.readText(path).copy(text = "完整的本地文件"))
            journal(space, true)
            // No remote profile or network is available at this registration boundary.
            compose.runOnUiThread {
                val restored = EidosModel(compose.activity.application)
                model = restored
                compose.activity.setContent { EidosApp(restored) }
            }
            compose.waitUntil(15_000) {
                model?.state?.value?.pendingClone != null && model?.state?.value?.busy == false
            }
            compose.onNodeWithContentDescription("切换 Space").performClick()
            compose.onNodeWithText("处理未完成的下载").performClick()
            compose.onNodeWithText("文件已完整下载，可以离线完成导入。").assertIsDisplayed()
            compose.onNodeWithText("完成导入").performClick()
            compose.waitUntil(15_000) {
                model?.state?.value?.spaceId == space.id && model?.state?.value?.busy == false
            }
            assertNull(CloneJournal(context).pending())
            journal(space, true) // Registration committed, journal clearing was interrupted.
            assertEquals(space, CloneJournal(context).resume(space.id))
            assertEquals(1, SpaceCatalog(context).spaces().count { it.id == space.id })
            journal(space, true)
            CloneJournal(context).discard(space.id)
            assertEquals("完整的本地文件", repo.readText(path).text)
        } finally {
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            SpaceCatalog(context).select(original)
            cleanup(space)
        }
    }

    @Test
    fun interruptedDownloadRestartsReservedRootWithPersistedCredentials(): Unit = runBlocking {
        val base = InstrumentationRegistry.getArguments().getString("graftRemoteUrl")
        Assume.assumeNotNull(base)
        val suffix = UUID.randomUUID().toString()
        val sourceId = "recovery-source-$suffix"
        val source = SpaceRepository(context, sourceId)
        val space = SpaceCatalog(context).prepare("重新下载-$suffix")
        try {
            val path = source.create("", "完整资料", "markdown")
            source.saveText(source.readText(path).copy(text = "下载后的完整内容"))
            val url = "$base/android/recover-$suffix"
            source.connectRemote(url, "ephemeral-test-token")
            source.syncRemote(publish = true)
            SpaceRepository(context, space.id)
            val root = File(context.filesDir, "spaces/${space.id}")
            File(root, "partial.tmp").writeText("incomplete")
            SyncProfileStore(context, space.id).save(SyncProfile(url, "ephemeral-test-token"))
            journal(space, false)
            assertFalse(SpaceCatalog(context).spaces().any { it.id == space.id })
            assertEquals(space, CloneJournal(context).resume(space.id))
            assertFalse(File(root, "partial.tmp").exists())
            val restored = SpaceRepository(context, space.id)
            assertEquals("下载后的完整内容", restored.readText(path).text)
            assertEquals("synced", restored.syncRemote())
            assertNull(CloneJournal(context).pending())
        } finally {
            cleanup(space)
            source.disconnectRemote()
            source.close()
            File(context.filesDir, "spaces/$sourceId").deleteRecursively()
        }
    }
}
