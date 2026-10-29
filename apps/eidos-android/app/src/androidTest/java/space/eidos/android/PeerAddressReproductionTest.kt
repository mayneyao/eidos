package space.eidos.android

import android.util.Base64
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.viewModelScope
import java.io.File
import java.util.UUID
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Issue #348 characterization on an emulator or a physical Android device. */
class PeerAddressReproductionTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    private fun invitation(host: String): String = "eidos-peer:" + Base64.encodeToString(
        JSONObject().put("version", 1).put("url", "https://$host:45678")
            .put("fingerprint", "a".repeat(64)).put("ticket", "b".repeat(43))
            .put("space", "device").put("name", "Issue 348 fixture")
            .toString().toByteArray(),
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
    )

    private fun withModel(action: (EidosModel) -> Unit) = runBlocking {
        val app = compose.activity.application
        val id = "issue348-${UUID.randomUUID()}"
        lateinit var model: EidosModel
        compose.runOnUiThread {
            model = EidosModel(app, SpaceRepository(app, id))
            compose.activity.setContent {
                val state = model.state.collectAsState()
                MaterialTheme(colorScheme = eidosColorScheme()) {
                    PeerSyncScreen(state.value.copy(peerDevices = emptyList()), model)
                }
            }
        }
        try {
            compose.waitUntil(30_000) { !model.state.value.busy }
            action(model)
        } finally {
            compose.runOnUiThread { model.viewModelScope.cancel() }
            model.repository.close()
            File(app.filesDir, "spaces/$id").deleteRecursively()
        }
    }

    private fun rejectsAddress(host: String) = withModel { model ->
        compose.onNodeWithText(tr("使用配对码")).performClick()
        compose.onNodeWithText(tr("配对码")).performTextInput(invitation(host))
        compose.onNodeWithText(tr("连接电脑")).performClick()
        compose.waitUntil(20_000) { model.state.value.error != null && !model.state.value.peerBusy }
        val expected = tr("配对地址 {0} 无法用于局域网连接。请在电脑上重新生成配对码。", host)
        assertEquals(expected, model.state.value.error)
        compose.onNodeWithText(expected).assertIsDisplayed()
        compose.onRoot().captureToImage().asAndroidBitmap().let { bitmap ->
            File(compose.activity.cacheDir, "issue348-$host.png").outputStream().use {
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
        }
        android.util.Log.i("Issue348", "$host: reproduced local-network rejection in pairing UI")
    }

    @Test fun rejectsLinkLocalAddress() = rejectsAddress("169.254.12.34")
    @Test fun rejectsSharedAddress() = rejectsAddress("100.64.1.2")
    @Test fun rejectsTunAddress() = rejectsAddress("198.18.0.1")

    @Test fun rejectsMismatchedCertificate() = runBlocking {
        val fixture = File(compose.activity.cacheDir, "issue348-invitation.txt")
        assumeTrue("Supply a disposable PeerService invitation", fixture.exists())
        val parsed = PeerInvitation.parse(fixture.readText().trim()).copy(fingerprint = "0".repeat(64))
        val result = runCatching { PeerConnection.forInvitation(compose.activity, parsed) }
        assertTrue("A reachable address must not bypass the pinned certificate", result.isFailure)
    }

    @Test fun pairsWithDesktopOnActualLan() {
        val fixture = File(compose.activity.cacheDir, "issue348-invitation.txt")
        assumeTrue("Supply a disposable PeerService invitation", fixture.exists())
        val code = fixture.readText().trim()
        val qr = File(compose.activity.cacheDir, "issue348-qr.txt")
        val bytes = Base64.decode(qr.readText(), Base64.DEFAULT)
        val original = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        // Match the desktop's 320 px, pixelated display as well as its PNG payload.
        val bitmap = android.graphics.Bitmap.createScaledBitmap(original, 320, 320, false)
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        val decoded = com.google.zxing.qrcode.QRCodeReader().decode(com.google.zxing.BinaryBitmap(
            com.google.zxing.common.HybridBinarizer(com.google.zxing.RGBLuminanceSource(bitmap.width, bitmap.height, pixels)),
        ))
        assertEquals("Desktop QR and manual input must carry the same invitation", code, decoded.text)
        val parsed = PeerInvitation.parse(code)
        withModel { model ->
            try {
                compose.onNodeWithText(tr("使用配对码")).performClick()
                compose.onNodeWithText(tr("配对码")).performTextInput(code)
                compose.onNodeWithText(tr("连接电脑")).performClick()
                compose.waitUntil(30_000) {
                    model.state.value.error != null || model.state.value.peerMessage == "设备已连接，请选择要同步的 Space"
                }
                assertNull(model.state.value.error, model.state.value.error)
                assertEquals("设备已连接，请选择要同步的 Space", model.state.value.peerMessage)
                assertTrue(PeerConnection.devices(compose.activity).any { it.fingerprint == parsed.fingerprint })
                val saved = PeerConnection.load(compose.activity, "device-${parsed.fingerprint}")!!
                assertTrue(isPeerLanHost(java.net.URI(saved.url).host))
                android.util.Log.i("Issue348", "${parsed.url} -> ${saved.url}: actual LAN pairing and authenticated /spaces succeeded")
            } finally {
                PeerConnection.forgetDevice(compose.activity, parsed.fingerprint)
            }
        }
    }
}
