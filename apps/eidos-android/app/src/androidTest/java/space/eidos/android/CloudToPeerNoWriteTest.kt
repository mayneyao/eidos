package space.eidos.android

import androidx.activity.compose.setContent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Opt-in original user journey: no Android content or settings mutations. */
class CloudToPeerNoWriteTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun windowsCloudUpdateThenAndroidSync() = runBlocking {
        val app = compose.activity.application
        val fixture = File(app.cacheDir, "cloud-peer-fixture.json")
        assumeTrue("Provide the isolated Desktop cloud-to-peer fixture", fixture.exists())
        val options = JSONObject(fixture.readText())
        val invitation = PeerInvitation.parse(options.getString("invitation"))
        val launchId = "cloud-peer-launch-${UUID.randomUUID()}"
        lateinit var model: EidosModel
        var connection: PeerConnection? = null
        val samples = JSONArray()
        var failure: String? = null
        fun awaitSync() {
            compose.waitUntil(180_000) { model.state.value.peerProgress?.finishedAt != null }
            val progress = model.state.value.peerProgress!!
            assertNull(progress.error, progress.error)
        }
        fun sample(phase: String): JSONObject {
            val root = File(app.filesDir, "spaces/${model.state.value.spaceId}")
            val status = NativeGraft.call(root.path, "status").getJSONObject("status")
            val snapshot = NativeRuntime.call(File(root, "eidos-project.eidos").path, "getSnapshot")
            NativeRuntime.close()
            return JSONObject().put("phase", phase).put("head", status.getString("current_head"))
                .put("revision", snapshot.getString("revision")).put("spaceId", model.state.value.spaceId)
                .also {
                    samples.put(it)
                    File(app.cacheDir, "cloud-peer-observations.json").writeText(samples.toString(2))
                }
        }
        fun sync() {
            compose.onAllNodesWithText("同步").filterToOne(hasClickAction()).performClick()
            compose.waitUntil(10_000) { model.state.value.peerBusy }
            awaitSync()
        }
        fun editorReady(): Boolean {
            fun find(view: View): WebView? {
                if (view is WebView) return view
                if (view is ViewGroup) for (index in 0 until view.childCount) find(view.getChildAt(index))?.let { return it }
                return null
            }
            val latch = CountDownLatch(1)
            var ready = false
            compose.runOnUiThread {
                val web = find(compose.activity.window.decorView)
                if (web == null) latch.countDown()
                else web.evaluateJavascript("document.querySelector('.mobile-view-switcher') !== null") {
                    ready = it == "true"
                    latch.countDown()
                }
            }
            latch.await(5, TimeUnit.SECONDS)
            return ready
        }
        try {
            compose.runOnUiThread {
                model = EidosModel(app, SpaceRepository(app, launchId))
                model.peerSelectedDevice = invitation.fingerprint
                compose.activity.setContent {
                    val state = model.state.collectAsState()
                    MaterialTheme(colorScheme = eidosColorScheme()) { SyncScreen(state.value, model) }
                }
                model.pairPeer(options.getString("invitation"))
            }
            compose.waitUntil(30_000) { !model.state.value.peerBusy && model.state.value.peerSpaces.any { it.fingerprint == invitation.fingerprint } }
            connection = checkNotNull(PeerConnection.load(app, "device-${invitation.fingerprint}"))
            compose.runOnUiThread { model.refreshPeerAvailability() }
            compose.waitUntil(60_000) { model.state.value.peerAvailability[invitation.fingerprint]?.reachable == true }
            compose.onNodeWithText("下载").performClick()
            awaitSync()
            val baseline = sample("initial-download")
            if (options.optBoolean("openBeforeSync")) {
                val file = model.repository.file("eidos-project.eidos")
                compose.runOnUiThread {
                    compose.activity.setContent { EidosApp(model) }
                    model.open(file)
                }
                compose.waitUntil(60_000) { editorReady() }
                delay(2_000)
                compose.onNodeWithContentDescription("返回文件").performClick()
                compose.waitUntil(30_000) { model.state.value.webFile == null }
                compose.runOnUiThread {
                    compose.activity.setContent {
                        val state = model.state.collectAsState()
                        MaterialTheme(colorScheme = eidosColorScheme()) { SyncScreen(state.value, model) }
                    }
                }
                val viewed = sample("opened-and-closed-without-editing")
                assertEquals("Opening the editor must not change file revision", baseline.getString("revision"), viewed.getString("revision"))
            }
            val mac = connection.call("/fixture", JSONObject().put("advanceWindows", true).put("phase", "windows-cloud-update"))
            assertNotEquals(baseline.getString("head"), mac.getString("head"))
            sync()
            val received = sample("received-windows-update")
            assertEquals("Android must fast-forward to macOS without a merge-only commit", mac.getString("head"), received.getString("head"))
            assertEquals(mac.getString("revision"), received.getString("revision"))
            connection.call("/fixture", JSONObject().put("phase", "repeat-without-edits"))
            sync()
            val repeated = sample("repeat-without-edits")
            assertEquals(received.getString("head"), repeated.getString("head"))
            assertEquals(received.getString("revision"), repeated.getString("revision"))
            val desktop = connection.call("/fixture", JSONObject().put("phase", "verify-desktop"))
            assertEquals(mac.getString("head"), desktop.getString("head"))
        } catch (error: Throwable) {
            failure = error.message ?: error.toString()
            throw error
        } finally {
            connection?.call("/fixture", JSONObject().put("finished", true).also { if (failure != null) it.put("error", failure) })
            compose.runOnUiThread { model.viewModelScope.cancel() }
            model.repository.close()
        }
    }
}
