package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.workDataOf
import java.io.File
import java.util.UUID
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Test

class BackgroundSyncTest {
    private val context
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    private suspend fun removeSpace(id: String) {
        BackgroundSync.setAutomatic(context, id, false)
        BackgroundSync.cancel(context, id)
        val prefs =
            context.getSharedPreferences("space-catalog", android.content.Context.MODE_PRIVATE)
        val all = JSONArray(prefs.getString("spaces", "[]"))
        prefs
            .edit()
            .putString(
                "spaces",
                JSONArray(
                        (0 until all.length()).map(all::getJSONObject).filter {
                            it.getString("id") != id
                        }
                    )
                    .toString(),
            )
            .commit()
        SyncProfileStore(context, id).clear()
        File(context.filesDir, "spaces/$id").deleteRecursively()
        context.deleteSharedPreferences("space-$id")
        context.deleteSharedPreferences("background-sync-$id")
        context.deleteSharedPreferences("automatic-sync-$id")
        context.deleteSharedPreferences("background-sync-$id-auto")
    }

    @Test
    fun defersWhileEditorIsPresentWithoutCreatingHistory(): Unit = runBlocking {
        val space = SpaceCatalog(context).create("编辑保护-${UUID.randomUUID()}")
        val owner = Any()
        try {
            BackgroundSyncGate.update(owner, true)
            val worker =
                TestListenableWorkerBuilder<SpaceSyncWorker>(context)
                    .setInputData(workDataOf("spaceId" to space.id))
                    .build()
            assertEquals(ListenableWorker.Result.retry(), worker.doWork())
            assertFalse(File(context.filesDir, "spaces/${space.id}/.graft").exists())
            BackgroundSyncGate.remove(owner)
            val disconnected =
                TestListenableWorkerBuilder<SpaceSyncWorker>(context)
                    .setInputData(workDataOf("spaceId" to space.id))
                    .build()
                    .doWork()
            assertTrue(disconnected is ListenableWorker.Result.Failure)
        } finally {
            BackgroundSyncGate.remove(owner)
            removeSpace(space.id)
        }
    }

    @Test
    fun retriesPersistedFailuresWithoutCountingForegroundDeferral(): Unit = runBlocking {
        val base = InstrumentationRegistry.getArguments().getString("graftRemoteUrl")
        Assume.assumeNotNull(base)
        val space = SpaceCatalog(context).create("后台重试-${UUID.randomUUID()}")
        val repository = SpaceRepository(context, space.id)
        val owner = Any()
        try {
            repository.connectRemote("$base/android/retry-${UUID.randomUUID()}", "wrong-token")
            val worker =
                TestListenableWorkerBuilder<SpaceSyncWorker>(context)
                    .setInputData(workDataOf("spaceId" to space.id))
                    .build()
            BackgroundSyncGate.update(owner, true)
            assertEquals(ListenableWorker.Result.retry(), worker.doWork())
            BackgroundSyncGate.remove(owner)
            repeat(5) { attempt ->
                assertEquals(ListenableWorker.Result.retry(), worker.doWork())
                assertTrue(
                    BackgroundSyncDetails(context, space.id)
                        .message(worker.id.toString())!!
                        .contains("第 ${attempt + 1} 次")
                )
            }
            assertTrue(worker.doWork() is ListenableWorker.Result.Failure)
        } finally {
            BackgroundSyncGate.remove(owner)
            repository.close()
            removeSpace(space.id)
        }
    }

    @Test
    fun durableQueueDownloadsRemoteAndReportsDivergence(): Unit = runBlocking {
        val base = InstrumentationRegistry.getArguments().getString("graftRemoteUrl")
        Assume.assumeNotNull(base)
        val space = SpaceCatalog(context).create("后台同步-${UUID.randomUUID()}")
        val repository = SpaceRepository(context, space.id)
        val root = File(context.filesDir, "spaces/${space.id}")
        val peer = File(context.cacheDir, "background-peer-${UUID.randomUUID()}").apply { mkdirs() }
        val url = "$base/android/background-${UUID.randomUUID()}"
        try {
            val path = repository.create("", "笔记", "markdown")
            repository.saveText(repository.readText(path).copy(text = "初始内容"))
            repository.connectRemote(url, "ephemeral-test-token")
            repository.syncRemote(publish = true)
            NativeGraft.call(
                peer.path,
                "clone",
                JSONObject().put("url", "graft+$url").put("token", "ephemeral-test-token"),
            )
            File(peer, path).writeText("来自电脑的修改")
            NativeGraft.call(peer.path, "checkpoint")
            NativeGraft.call(peer.path, "push")
            BackgroundSync.enqueue(context, space.id)
            val completed =
                withTimeout(60_000) {
                    BackgroundSync.observe(context, space.id).first { infos ->
                        backgroundSyncState(infos)?.state == "SUCCEEDED"
                    }
                }
            assertEquals("来自电脑的修改", repository.readText(path).text)
            assertTrue(
                completed.all { it.constraints.requiredNetworkType == NetworkType.CONNECTED }
            )
            assertEquals("后台同步已完成", backgroundSyncState(completed)?.message)
            // A new WorkManager lookup sees the durable result without retaining the original
            // observer.
            val restored =
                WorkManager.getInstance(context)
                    .getWorkInfosForUniqueWork(BackgroundSync.name(space.id))
                    .get()
            assertTrue(restored.any { it.state == WorkInfo.State.SUCCEEDED })
            repository.saveText(repository.readText(path).copy(text = "手机未合并修改"))
            BackgroundSync.setAutomatic(context, space.id, true)
            NativeGraft.call(
                peer.path,
                "configureRemote",
                JSONObject().put("url", "graft+$url").put("token", "ephemeral-test-token"),
            )
            File(peer, path).writeText("电脑未合并修改")
            NativeGraft.call(peer.path, "checkpoint")
            NativeGraft.call(peer.path, "push")
            BackgroundSync.enqueue(context, space.id)
            val failed =
                withTimeout(60_000) {
                    BackgroundSync.observe(context, space.id).first { infos ->
                        backgroundSyncState(infos)?.state == "FAILED"
                    }
                }
            assertTrue(backgroundSyncState(failed)!!.message.contains("需要合并"))
            assertFalse(BackgroundSync.automaticSettings(context, space.id).enabled)
            assertTrue(
                BackgroundSync.automaticSettings(context, space.id).reason!!.contains("需要合并")
            )
            assertEquals("手机未合并修改", repository.readText(path).text)
            assertEquals("电脑未合并修改", File(peer, path).readText())
        } finally {
            BackgroundSync.cancel(context, space.id)
            repository.close()
            NativeGraft.call(peer.path, "close")
            peer.deleteRecursively()
            removeSpace(space.id)
        }
    }
}
