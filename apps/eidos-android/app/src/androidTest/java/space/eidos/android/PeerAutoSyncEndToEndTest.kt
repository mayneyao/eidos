package space.eidos.android

import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Real pinned-TLS Desktop fixture, production coordinator and Android JNI. */
class PeerAutoSyncEndToEndTest {
    private val app get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val config get() = File(app.cacheDir, "auto-fixture.json").let {
        assumeTrue("Requires peer-auto-sync.manual.test.ts", it.exists())
        JSONObject(it.readText())
    }
    private val invitation get() = PeerInvitation.parse(config.getString("invitation"))
    private val controller by lazy {
        val peer = invitation
        PeerConnection(peer.url, peer.fingerprint, config.getString("controlToken"), "Test control")
    }
    private fun control(action: String, extra: JSONObject = JSONObject()): JSONObject {
        return controller.call("/auto-fixture", extra.put("action", action), timeoutMillis = 10_000)
    }
    private fun head(root: File) = NativeGraft.call(root.path, "status").getJSONObject("status").getString("current_head")
    private suspend fun waitForGate() = withTimeout(10_000) {
        while (!control("status").getBoolean("entered")) delay(50)
    }
    private suspend fun withSpace(connection: PeerConnection, keep: Boolean = false,
        body: suspend (SpaceRepository, File, String) -> Unit) {
        val catalog = SpaceCatalog(app)
        val space = catalog.getOrCreatePeerSpace(connection.fingerprint, invitation.space, "Auto E2E")
        val repository = SpaceRepository(app, space.id)
        val root = File(app.filesDir, "spaces/${space.id}")
        connection.save(app, space.id)
        repository.syncPeer(connection) {}
        repository.finalizePeerDownload()
        catalog.completePeerSpace(connection.fingerprint, invitation.space, space)
        val manual = control("downloaded").getInt("manualSyncs")
        try {
            body(repository, root, head(root))
            assertEquals("Automatic pull must never call /sync", manual, control("status").getInt("manualSyncs"))
        } finally {
            control("release")
            if (!keep) {
                if (catalog.activeId() == space.id) catalog.select(catalog.spaces().first { it.id != space.id }.id)
                repository.deleteLocalSpace()
            }
        }
    }

    @Test fun nativeScenariosAndPrepareBackgroundWorker() = runBlocking {
        val peer = invitation
        check(SpaceCatalog(app).peerLocalSpaces().isEmpty()) { "Use a fresh, isolated emulator application" }
        val pairing = PeerConnection(peer.url, peer.fingerprint, peer.ticket, "Android auto E2E")
        val approved = withTimeout(15_000) {
            var value = pairing.call("/pair", JSONObject().put("name", "Android auto E2E"))
            while (value.optString("state") != "approved") { delay(100); value = pairing.call("/pair", JSONObject().put("name", "Android auto E2E")) }
            value
        }
        val connection = PeerConnection(peer.url, peer.fingerprint, approved.getString("token"), "Auto E2E")
        connection.saveDevice(app)
        val checks = mutableListOf<String>()
        withSpace(connection) { repo, root, before ->
            val advanced = control("advance", JSONObject().put("label", "android-clean"))
            val updates = control("status").getInt("updates")
            val result = coroutineScope {
                val first = async(Dispatchers.IO) { PeerAutoSync.pull(app) }
                val second = async(Dispatchers.IO) { PeerAutoSync.pull(app) }
                first.await() + second.await()
            }
            assertEquals(setOf(repo.spaceId), result)
            assertEquals(advanced.getString("head"), head(root))
            assertNotEquals(before, head(root))
            assertEquals("android-clean", File(root, "note.md").readText())
            assertEquals(updates + 1, control("status").getInt("updates"))
            assertTrue(PeerAutoSync.pull(app).isEmpty())
            assertFalse(NativeGraft.call(root.path, "status").getJSONObject("status").getBoolean("dirty"))
            checks.add("clean-fast-forward-repeat-and-coalescing")
        }
        withSpace(connection) { _, root, before ->
            File(root, "note.md").writeText("local Markdown")
            File(root, "assets/sample.bin").writeBytes(byteArrayOf(9, 8, 7))
            control("advance", JSONObject().put("label", "android-dirty"))
            assertTrue(PeerAutoSync.pull(app).isEmpty())
            assertEquals(before, head(root))
            assertEquals("local Markdown", File(root, "note.md").readText())
            assertArrayEquals(byteArrayOf(9, 8, 7), File(root, "assets/sample.bin").readBytes())
            checks.add("dirty-markdown-and-attachment")
        }
        withSpace(connection) { _, root, before ->
            val database = File(root, "data.eidos")
            val schema = NativeRuntime.call(database.path, "schema")
            val objects = schema.getJSONArray("objects")
            val table = (0 until objects.length()).map { objects.getJSONObject(it) }.first { it.getString("object") == "table" }
            NativeRuntime.call(database.path, "mutateRows", JSONObject().put("tableId", table.getString("id"))
                .put("expectedRevision", schema.getJSONObject("snapshot").get("revision"))
                .put("changes", org.json.JSONArray().put(JSONObject().put("kind", "create").put("clientKey", "local")
                    .put("values", JSONObject().put(table.getString("labelFieldId"), "local SQLite write")))))
            NativeRuntime.close()
            val bytes = database.readBytes()
            control("advance", JSONObject().put("label", "android-sqlite"))
            assertTrue(PeerAutoSync.pull(app).isEmpty())
            assertEquals(before, head(root))
            assertArrayEquals(bytes, database.readBytes())
            checks.add("canonical-sqlite-local-write")
        }
        withSpace(connection) { repo, root, before ->
            repo.saveDraft(repo.readText("note.md").copy(text = "private unsaved draft"))
            control("advance", JSONObject().put("label", "android-draft"))
            assertTrue(PeerAutoSync.pull(app).isEmpty())
            assertEquals(before, head(root))
            assertEquals("private unsaved draft", repo.readText("note.md").text)
            checks.add("private-recovery-draft")
        }
        withSpace(connection) { _, root, before ->
            control("advance", JSONObject().put("label", "android-concurrent"))
            control("arm", JSONObject().put("gate", "graft"))
            coroutineScope {
                val task = async(Dispatchers.IO) { PeerAutoSync.pull(app) }
                waitForGate()
                // Simulate an external Files writer, independent of the repository mutex.
                File(root, "note.md").writeText("external edit during fetch")
                control("release")
                assertTrue(task.await().isEmpty())
            }
            assertEquals(before, head(root))
            assertEquals("external edit during fetch", File(root, "note.md").readText())
            checks.add("disk-edit-during-real-fetch")
        }
        withSpace(connection) { _, root, before ->
            val remote = control("advance", JSONObject().put("label", "android-cancelled"))
            control("arm", JSONObject().put("gate", "graft"))
            coroutineScope {
                val task = launch(Dispatchers.IO) { PeerAutoSync.pull(app) }
                waitForGate()
                val start = android.os.SystemClock.elapsedRealtime()
                withTimeout(5000) { task.cancelAndJoin() }
                assertTrue(android.os.SystemClock.elapsedRealtime() - start < 5000)
                control("release")
            }
            assertEquals(before, head(root))
            assertEquals(setOf(SpaceCatalog(app).peerLocalSpaces().single().id), PeerAutoSync.pull(app))
            assertEquals(remote.getString("head"), head(root))
            checks.add("cancel-real-native-fetch-and-retry")
        }
        withSpace(connection) { repo, root, before ->
            SpaceCatalog(app).select(repo.spaceId)
            val scenario = ActivityScenario.launch(MainActivity::class.java)
            var model: EidosModel? = null
            scenario.onActivity { model = ViewModelProvider(it)[EidosModel::class.java] }
            val live = checkNotNull(model)
            try {
                withTimeout(10_000) { while (live.state.value.busy) delay(50) }
                control("advance", JSONObject().put("label", "android-editor"))
                control("arm", JSONObject().put("gate", "graft"))
                coroutineScope {
                    val task = async(Dispatchers.IO) { PeerAutoSync.pull(app) }
                    waitForGate()
                    scenario.onActivity { live.open(live.state.value.files.single { it.path == "note.md" }) }
                    control("release")
                    task.await()
                }
                withTimeout(10_000) { while (live.state.value.webFile == null || live.state.value.busy) delay(50) }
                assertEquals(before, head(root))
                repo.saveText(repo.readText("note.md").copy(text = "real editor local write"))
                assertTrue(PeerAutoSync.pull(app).isEmpty())
                assertEquals("real editor local write", File(root, "note.md").readText())
                assertEquals(before, head(root))
                checks.add("real-model-editor-opens-during-fetch")
            } finally { scenario.close() }
        }
        withSpace(connection) { repo, root, _ ->
            File(root, "local.md").writeText("local independent commit")
            repo.checkpoint()
            val before = head(root)
            control("advance", JSONObject().put("label", "android-diverged"))
            assertTrue(PeerAutoSync.pull(app).isEmpty())
            assertEquals(before, head(root))
            assertEquals("local independent commit", File(root, "local.md").readText())
            checks.add("clean-but-diverged-commits")
        }
        withSpace(connection, keep = true) { repo, _, _ ->
            File(app.cacheDir, "auto-local.json").writeText(JSONObject().put("id", repo.spaceId).put("checks", org.json.JSONArray(checks)).toString())
            PeerAutoSync.schedule(app)
        }
    }

    @Test fun verifyBackgroundAndDirtyWorkerProtection() = runBlocking {
        assumeTrue("Requires the desktop fixture", File(app.cacheDir, "auto-fixture.json").exists())
        val localFile = File(app.cacheDir, "auto-local.json")
        assumeTrue("Requires the staged background fixture", localFile.exists())
        val local = JSONObject(localFile.readText())
        val id = local.getString("id")
        val root = File(app.filesDir, "spaces/$id")
        assertEquals("locked-background", File(root, "note.md").readText())
        assertEquals(JSONObject(File(app.cacheDir, "auto-background.json").readText()).getString("head"), head(root))
        val before = head(root)
        val manager = WorkManager.getInstance(app)
        val repository = SpaceRepository(app, id)
        control("advance", JSONObject().put("label", "android-worker-cancelled"))
        control("arm", JSONObject().put("gate", "graft"))
        val cancelled = OneTimeWorkRequestBuilder<PeerAutoSyncWorker>().build()
        manager.enqueue(cancelled).result.get()
        waitForGate()
        val stopping = android.os.SystemClock.elapsedRealtime()
        manager.cancelWorkById(cancelled.id).result.get()
        withTimeout(5000) { repository.graftStatus() }
        assertTrue("Worker cancellation must release native storage", android.os.SystemClock.elapsedRealtime() - stopping < 5000)
        control("release")
        assertEquals(androidx.work.WorkInfo.State.CANCELLED, manager.getWorkInfoById(cancelled.id).get()!!.state)
        assertEquals(before, head(root))
        assertEquals("locked-background", File(root, "note.md").readText())
        File(root, "note.md").writeText("local edit before background worker")
        control("advance", JSONObject().put("label", "android-dirty-worker"))
        val request = OneTimeWorkRequestBuilder<PeerAutoSyncWorker>().build()
        manager.enqueue(request).result.get()
        withTimeout(20_000) { while (manager.getWorkInfoById(request.id).get()?.state?.isFinished != true) delay(100) }
        assertEquals(before, head(root))
        assertEquals("local edit before background worker", File(root, "note.md").readText())
        assertEquals(androidx.work.WorkInfo.State.SUCCEEDED, manager.getWorkInfoById(request.id).get()!!.state)
        val checks = local.getJSONArray("checks").put("locked-cold-process-JobScheduler-wakeup")
            .put("WorkManager-cancels-real-fetch-and-releases-storage").put("dirty-worker-preserves-local-write")
        File(app.cacheDir, "auto-result.json").writeText(JSONObject().put("checks", checks).put("head", before).toString(2))
        manager.cancelUniqueWork("eidos-lan-updates").result.get()
        manager.cancelUniqueWork("eidos-lan-updates-now").result.get()
        repository.deleteLocalSpace()
        PeerConnection.forgetDevice(app, invitation.fingerprint)
    }
}
