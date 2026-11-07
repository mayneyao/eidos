package space.eidos.android

import org.junit.Assert.*
import org.junit.Test

class CustomSyncAddressTest {
    @Test fun passwordBudgetUsesUtf8BytesBeforeProvisioning() {
        assertEquals("😀".repeat(256), CustomSyncAddress.password("😀".repeat(256)))
        assertEquals("s".repeat(1024), CustomSyncAddress.password("s".repeat(1024)))
        for (value in listOf("", "s".repeat(1025), "😀".repeat(257))) assertTrue(runCatching { CustomSyncAddress.password(value) }.isFailure)
    }
    @Test fun acceptsServerOriginsAndCompleteRepositoryAddresses() {
        assertEquals("https://sync.example.com", CustomSyncAddress.origin(" https://SYNC.example.com/ "))
        assertEquals("http://192.168.1.2:8787/personal/notes", CustomSyncAddress.repository("graft+http://192.168.1.2:8787/personal/notes/"))
        CustomSyncAddress.encrypted("https://sync.example.com")
        CustomSyncAddress.encrypted("http://127.0.0.1:8787")
    }
    @Test fun rejectsCredentialBearingAndAmbiguousUrls() {
        listOf("https://user:secret@example.com", "https://example.com/path", "https://example.com?token=secret", "https://example.com#secret", "file:///tmp/remote", "https://example.com:0").forEach {
            assertTrue(it, runCatching { CustomSyncAddress.origin(it) }.isFailure)
        }
        listOf("https://example.com", "https://u:p@example.com/notes", "https://example.com/notes?t=secret", "https://example.com/notes#secret").forEach {
            assertTrue(it, runCatching { CustomSyncAddress.repository(it) }.isFailure)
        }
        assertTrue(runCatching { CustomSyncAddress.encrypted("http://192.168.1.2:8787") }.isFailure)
    }
}
