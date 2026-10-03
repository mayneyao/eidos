package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Test

class SyncStatusTest {
    @Test
    fun successIsBoundToRemoteHeadAndCleanWorktree(): Unit = runBlocking {
        val base = InstrumentationRegistry.getArguments().getString("graftRemoteUrl")
        Assume.assumeNotNull(base)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val id = "status-${UUID.randomUUID()}"
        val repo = SpaceRepository(context, id)
        try {
            val path = repo.create("", "笔记", "markdown")
            assertEquals("local", repo.graftStatus().syncStatus)
            val url = "$base/android/$id"
            repo.connectRemote(url, "ephemeral-test-token")
            assertEquals("pending", repo.graftStatus().syncStatus)
            assertEquals("synced", repo.syncRemote(publish = true))
            assertEquals("completed", repo.graftStatus().syncStatus)
            repo.close()
            assertEquals("completed", SpaceRepository(context, id).graftStatus().syncStatus)
            repo.saveText(repo.readText(path).copy(text = "新修改"))
            assertEquals("pending", repo.graftStatus().syncStatus)
            repo.checkpoint()
            assertFalse(repo.graftStatus().dirty)
            assertEquals("pending", repo.graftStatus().syncStatus)
            repo.syncRemote()
            assertEquals("completed", repo.graftStatus().syncStatus)
            repo.connectRemote(url, "wrong-token")
            assertTrue(runCatching { repo.syncRemote() }.isFailure)
            assertEquals("failed", repo.graftStatus().syncStatus)
            repo.disconnectRemote()
            assertEquals("local", repo.graftStatus().syncStatus)
        } finally {
            repo.close()
            File(context.filesDir, "spaces/$id").deleteRecursively()
            context.deleteSharedPreferences("space-$id")
        }
    }
}
