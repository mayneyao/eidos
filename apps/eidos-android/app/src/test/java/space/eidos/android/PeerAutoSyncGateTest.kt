package space.eidos.android

import org.junit.Assert.*
import org.junit.Test

class PeerAutoSyncGateTest {
    @Test fun foregroundCatchupRequiresAllEditorOwnersToBeIdleAndRejectsStaleLeases() {
        val foreground = Any()
        val editor = Any()
        try {
            BackgroundSyncGate.update(foreground, blocked = true, lanBlocked = false)
            assertTrue(BackgroundSyncGate.blocked())
            val lease = checkNotNull(BackgroundSyncGate.lanLease())
            assertTrue(BackgroundSyncGate.lanAllowed(lease))
            BackgroundSyncGate.update(editor, true)
            assertNull(BackgroundSyncGate.lanLease())
            assertFalse(BackgroundSyncGate.lanAllowed(lease))
            BackgroundSyncGate.remove(editor)
            assertFalse(BackgroundSyncGate.lanAllowed(lease))
            assertNotNull(BackgroundSyncGate.lanLease())
        } finally {
            BackgroundSyncGate.remove(editor)
            BackgroundSyncGate.remove(foreground)
        }
    }
}
