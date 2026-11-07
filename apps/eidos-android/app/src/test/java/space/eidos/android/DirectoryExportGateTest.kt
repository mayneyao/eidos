package space.eidos.android

import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield
import org.junit.Assert.*
import org.junit.Test

class DirectoryExportGateTest {
    @Test
    fun waitsUntilForegroundAndPeerOperationsAreBothIdle(): Unit = runBlocking {
        val state = MutableStateFlow(AppState(busy = true))
        val waiting = async(start = CoroutineStart.UNDISPATCHED) {
            awaitDirectoryExportIdle(state, timeoutMillis = 5_000)
        }
        assertFalse(waiting.isCompleted)
        state.value = state.value.copy(busy = false, peerBusy = true)
        yield()
        assertFalse(waiting.isCompleted)
        state.value = state.value.copy(peerBusy = false)
        assertTrue(waiting.await())
    }

    @Test
    fun aBlockedSelectionExpiresInsteadOfWaitingIndefinitely(): Unit = runBlocking {
        val state = MutableStateFlow(AppState(peerBusy = true))
        val accepted = withTimeout(5_000) {
            awaitDirectoryExportIdle(state, timeoutMillis = 10)
        }
        assertFalse(accepted)
        assertTrue(state.value.peerBusy)
    }
}
