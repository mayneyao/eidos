package space.eidos.android

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class SyncNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun startupUsesSavedSpaceBeforeRepositoryReadsComplete() {
        val app = compose.activity.application
        val preferences = app.getSharedPreferences("space-catalog", 0)
        val savedSpaces = preferences.getString("spaces", "[]")
        val savedActive = preferences.getString("active", "personal")
        val catalog = SpaceCatalog(app)
        val space = catalog.create("Startup ${UUID.randomUUID()}")
        catalog.select(space.id)
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val repository =
            SpaceRepository(
                app,
                space.id,
                StorageSpace {
                    entered.countDown()
                    check(release.await(15, TimeUnit.SECONDS))
                    Long.MAX_VALUE
                },
            )
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val writer = scope.launch { repository.create("", "Restored note", "markdown") }
        var model: EidosModel? = null
        try {
            assertTrue(entered.await(5, TimeUnit.SECONDS))
            compose.runOnUiThread {
                val restored = EidosModel(app)
                model = restored
                assertEquals(space.id, restored.state.value.spaceId)
                assertEquals(space.name, restored.state.value.spaceName)
                compose.activity.setContent { EidosApp(restored) }
            }
            compose.onNodeWithText(space.name).assertIsDisplayed()
            compose.onAllNodesWithText("个人 Space").assertCountEquals(0)
            release.countDown()
            compose.waitUntil(10000) { model?.state?.value?.busy == false }
            assertTrue(model!!.state.value.files.any { it.name == "Restored note.md" })
            assertNull(model!!.state.value.graft)
            assertEquals(MainTab.Files, model!!.state.value.tab)
        } finally {
            release.countDown()
            runBlocking { writer.join() }
            compose.runOnUiThread { model?.viewModelScope?.cancel() }
            scope.cancel()
            runBlocking { repository.close() }
            preferences
                .edit()
                .putString("spaces", savedSpaces)
                .putString("active", savedActive)
                .commit()
            File(app.filesDir, "spaces/${space.id}").deleteRecursively()
        }
    }

    @Test
    fun pendingSyncStatusDoesNotBlockReturningToFiles() {
        val app = compose.activity.application
        val id = "sync-navigation-${UUID.randomUUID()}"
        val hold = AtomicBoolean(false)
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val repository =
            SpaceRepository(
                app,
                id,
                StorageSpace {
                    if (hold.get()) {
                        entered.countDown()
                        check(release.await(15, TimeUnit.SECONDS))
                    }
                    Long.MAX_VALUE
                },
            )
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        lateinit var model: EidosModel
        var writer: Job? = null
        try {
            runBlocking { repository.create("", "Local note", "markdown") }
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            // A background operation can own the repository while Sync reads its status.
            hold.set(true)
            writer = scope.launch { repository.create("", "Pending note", "markdown") }
            assertTrue(entered.await(5, TimeUnit.SECONDS))
            repeat(3) {
                compose.onNode(hasText("同步") and hasClickAction()).performClick()
                compose.onNode(hasText("资料") and hasClickAction()).assertIsEnabled().performClick()
                compose.waitUntil(1000) { model.state.value.tab == MainTab.Files }
                compose.onNodeWithText("Local note.md").assertIsDisplayed()
            }
            release.countDown()
            runBlocking { writer.join() }
            compose.waitForIdle()
            assertEquals(MainTab.Files, model.state.value.tab)
        } finally {
            release.countDown()
            runBlocking { writer?.join() }
            scope.cancel()
            compose.runOnUiThread { model.viewModelScope.cancel() }
            runBlocking { repository.close() }
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    @Test
    fun unresponsiveDesktopDoesNotBlockReturningToFiles() {
        val app = compose.activity.application
        val id = "offline-navigation-${UUID.randomUUID()}"
        val fingerprint = UUID.randomUUID().toString().replace("-", "").repeat(2)
        val server = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
        val repository = SpaceRepository(app, id)
        lateinit var model: EidosModel
        try {
            // Accept TCP but never reply to TLS, so the probe must wait for its timeout.
            PeerConnection(
                    "https://127.0.0.1:${server.localPort}",
                    fingerprint,
                    "test",
                    "Offline Mac",
                )
                .saveDevice(app)
            runBlocking { repository.create("", "Offline note", "markdown") }
            compose.runOnUiThread {
                model = EidosModel(app, repository)
                compose.activity.setContent { EidosApp(model) }
            }
            compose.waitUntil(15000) { !model.state.value.busy }
            compose.onNode(hasText("同步") and hasClickAction()).performClick()
            compose.waitUntil(5000) { model.state.value.peerChecking }
            compose.onNode(hasText("资料") and hasClickAction()).assertIsEnabled().performClick()
            compose.waitUntil(1000) { model.state.value.tab == MainTab.Files }
            compose.onNodeWithText("Offline note.md").assertIsDisplayed()
            compose.waitUntil(5000) { !model.state.value.peerChecking }
            assertEquals(MainTab.Files, model.state.value.tab)
        } finally {
            server.close()
            compose.runOnUiThread { model.viewModelScope.cancel() }
            app.getSharedPreferences("peer-devices", 0).edit().remove(fingerprint).commit()
            SyncProfileStore(app, "peer-device-$fingerprint").clear()
            runBlocking { repository.close() }
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }
}
