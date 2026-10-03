package space.eidos.android

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import androidx.test.platform.app.InstrumentationRegistry
import java.net.InetAddress
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test

class PeerDiscoveryTest {
    @Test
    fun discoversServiceThroughAndroidNsd() = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val manager = app.getSystemService(NsdManager::class.java)
        val fingerprint = UUID.randomUUID().toString().replace("-", "").repeat(2)
        val registered = CompletableDeferred<Unit>()
        val listener =
            object : NsdManager.RegistrationListener {
                override fun onServiceRegistered(info: NsdServiceInfo) {
                    registered.complete(Unit)
                }

                override fun onRegistrationFailed(info: NsdServiceInfo, code: Int) {
                    registered.completeExceptionally(
                        IllegalStateException("NSD registration failed: $code")
                    )
                }

                override fun onServiceUnregistered(info: NsdServiceInfo) {}

                override fun onUnregistrationFailed(info: NsdServiceInfo, code: Int) {}
            }
        try {
            manager.registerService(
                NsdServiceInfo().apply {
                    serviceName = "Eidos-test-${fingerprint.take(10)}"
                    serviceType = PeerDiscovery.SERVICE_TYPE
                    port = 45678
                    setAttribute("v", "1")
                    setAttribute("fingerprint", fingerprint)
                    setAttribute("space", "test-space")
                },
                NsdManager.PROTOCOL_DNS_SD,
                listener,
            )
            withTimeout(10000) { registered.await() }
            val endpoint = PeerDiscovery.find(app, fingerprint, "test-space") { it }
            assertNotNull("Android NSD should resolve the advertised endpoint", endpoint)
            assertTrue(endpoint!!.endsWith(":45678"))
        } finally {
            runCatching { manager.unregisterService(listener) }
        }
    }

    @Test
    fun discoveryRequiresMatchingDeviceSpaceAndPrivateAddress() {
        val service =
            NsdServiceInfo().apply {
                host = InetAddress.getByName("192.168.1.20")
                port = 4567
                setAttribute("v", "1")
                setAttribute("fingerprint", "a".repeat(64))
                setAttribute("space", "project")
            }
        assertEquals(
            "https://192.168.1.20:4567",
            PeerDiscovery.endpoint(service, "a".repeat(64), "project"),
        )
        assertNull(PeerDiscovery.endpoint(service, "b".repeat(64), "project"))
        assertNull(PeerDiscovery.endpoint(service, "a".repeat(64), "other-project"))
        service.host = InetAddress.getByName("8.8.8.8")
        assertNull(PeerDiscovery.endpoint(service, "a".repeat(64), null))
        service.host = InetAddress.getByName("192.168.1.21")
        service.setAttribute("v", "2")
        assertNull(PeerDiscovery.endpoint(service, "a".repeat(64), null))
    }
}
