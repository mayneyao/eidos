package space.eidos.android

import org.junit.Assert.*
import org.junit.Test

class PeerAddressTest {
    @Test fun acceptsPrivateIpv4AndLoopback() {
        listOf("10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.1.20", "127.0.0.1").forEach {
            assertTrue(it, isPeerLanHost(it))
        }
    }
    @Test fun rejectsUnsupportedOrAmbiguousHosts() {
        listOf("169.254.12.34", "100.64.1.2", "198.18.0.1", "8.8.8.8", "172.15.1.1", "172.32.0.1", "::1", "localhost", "10.0.0.256", "010.0.0.1", "10.1", "10.0.0.-1", "10.0.0.9999999999999999999").forEach {
            assertFalse(it, isPeerLanHost(it))
        }
    }
}
