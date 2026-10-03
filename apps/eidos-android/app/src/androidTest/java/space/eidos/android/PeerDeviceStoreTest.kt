package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import org.junit.Assert.*
import org.junit.Test

class PeerDeviceStoreTest {
    @Test
    fun deviceTrustPersistsIndependentlyOfSpacesAndRefreshesCredentials() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val fingerprint = UUID.randomUUID().toString().replace("-", "").repeat(2)
        val first = "test-${UUID.randomUUID()}"
        val second = "test-${UUID.randomUUID()}"
        try {
            val device =
                PeerConnection("https://127.0.0.1:4443", fingerprint, "first-token", "Computer")
            device.saveDevice(app)
            device.save(app, first)
            device.save(app, second)
            assertTrue(PeerConnection.devices(app).any { it.fingerprint == fingerprint })
            assertEquals("first-token", PeerConnection.load(app, "device-$fingerprint")!!.token)
            PeerConnection("https://127.0.0.1:4444", fingerprint, "new-token", "Computer")
                .saveDevice(app)
            assertEquals("new-token", PeerConnection.load(app, first)!!.token)
            assertEquals("new-token", PeerConnection.load(app, second)!!.token)
            // Per-Space endpoints stay separate from the last device discovery endpoint.
            assertEquals("https://127.0.0.1:4443", PeerConnection.load(app, first)!!.url)
        } finally {
            PeerConnection.forgetDevice(app, fingerprint)
            SyncProfileStore(app, "peer-$first").clear()
            SyncProfileStore(app, "peer-$second").clear()
        }
    }
}
