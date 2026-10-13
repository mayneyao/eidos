package space.eidos.android

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test

class PeerRaceTest {
    @Test fun verifiedResultBypassesFailureAndCancelsStaleProbe() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val cancelled = CompletableDeferred<Unit>()
        val value = withTimeout(1_000) {
            firstPeerResult(listOf(
                { null },
                { started.complete(Unit); try { awaitCancellation() } finally { cancelled.complete(Unit) } },
                { started.await(); "verified" },
            ))
        }
        assertEquals("verified", value)
        assertTrue(cancelled.isCompleted)
    }

    @Test fun allFailuresFinishWithoutWaitingForTimeout() = runBlocking {
        val value = withTimeout(1_000) {
            firstPeerResult<String>(listOf({ null }, { error("unreachable") }))
        }
        assertNull(value)
    }

    @Test fun callerCancellationStopsProbes() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val cancelled = CompletableDeferred<Unit>()
        val task = async {
            firstPeerResult<String>(listOf({
                started.complete(Unit)
                try { awaitCancellation() } finally { cancelled.complete(Unit) }
            }))
        }
        withTimeout(1_000) { started.await(); task.cancelAndJoin() }
        assertTrue(cancelled.isCompleted)
    }
}
