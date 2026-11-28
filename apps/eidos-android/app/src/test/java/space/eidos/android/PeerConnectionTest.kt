package space.eidos.android

import java.io.InputStream
import java.io.OutputStream
import java.net.ConnectException
import java.net.URL
import java.security.Principal
import java.security.cert.Certificate
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.HttpsURLConnection
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeHttpsURLConnection(url: String) : HttpsURLConnection(URL(url)) {
    val disconnected = AtomicBoolean(false)

    override fun disconnect() {
        disconnected.set(true)
    }

    override fun usingProxy(): Boolean = false

    override fun connect() {}

    override fun getCipherSuite(): String = ""

    override fun getLocalCertificates(): Array<Certificate>? = null

    override fun getServerCertificates(): Array<Certificate> = emptyArray()

    override fun getPeerPrincipal(): Principal? = null

    override fun getLocalPrincipal(): Principal? = null

    override fun getInputStream(): InputStream = InputStream.nullInputStream()

    override fun getOutputStream(): OutputStream = OutputStream.nullOutputStream()
}

class PeerConnectionTest {
    private val fingerprint = "a".repeat(64)
    private val url = "https://192.168.1.42:8443"

    @Test
    fun pooledConnectionsShareTlsObjectsButNotInstances() {
        val first = PeerConnection.pooled(url, fingerprint, "token-1", "Desktop")
        val second = PeerConnection.pooled(url, fingerprint, "token-1", "Desktop")
        assertNotSame(first, second)
        assertSame(first.socketFactory, second.socketFactory)
        assertSame(first.hostnameVerifier, second.hostnameVerifier)
    }

    @Test
    fun normalCompletionDoesNotDisconnectOverlappingRequests() = runBlocking {
        val connA = PeerConnection.pooled(url, fingerprint, "token-1", "Desktop")
        val connB = PeerConnection.pooled(url, fingerprint, "token-1", "Desktop")
        val reqA = FakeHttpsURLConnection("$url/spaces")
        val reqB = FakeHttpsURLConnection("$url/sync")

        val bStarted = CompletableDeferred<Unit>()
        val finishB = CompletableDeferred<Unit>()

        val jobB = async {
            connB.cancellable {
                connB.registerRequest(reqB)
                bStarted.complete(Unit)
                finishB.await()
                connB.unregisterRequest(reqB)
            }
        }
        withTimeout(2_000) { bStarted.await() }

        // Normal completion of connA's cancellable block must never disconnect reqA or reqB.
        connA.cancellable {
            connA.registerRequest(reqA)
        }
        assertFalse(reqA.disconnected.get())
        assertFalse(reqB.disconnected.get())

        finishB.complete(Unit)
        withTimeout(2_000) { jobB.await() }
        assertFalse(reqB.disconnected.get())
    }

    @Test
    fun cancellationDisconnectsOnlyCancelledOperation() = runBlocking {
        val connA = PeerConnection.pooled(url, fingerprint, "token-1", "Desktop")
        val connB = PeerConnection.pooled(url, fingerprint, "token-1", "Desktop")
        val reqA = FakeHttpsURLConnection("$url/sync")
        val reqB = FakeHttpsURLConnection("$url/spaces")

        val aStarted = CompletableDeferred<Unit>()
        val finishA = CompletableDeferred<Unit>()
        val bStarted = CompletableDeferred<Unit>()
        val finishB = CompletableDeferred<Unit>()

        val jobA = async {
            connA.cancellable {
                connA.registerRequest(reqA)
                aStarted.complete(Unit)
                finishA.await()
            }
        }
        val jobB = async {
            connB.cancellable {
                connB.registerRequest(reqB)
                bStarted.complete(Unit)
                finishB.await()
                connB.unregisterRequest(reqB)
            }
        }

        withTimeout(2_000) {
            aStarted.await()
            bStarted.await()
        }

        jobA.cancelAndJoin()
        assertTrue(reqA.disconnected.get())
        assertFalse(reqB.disconnected.get())

        finishB.complete(Unit)
        withTimeout(2_000) { jobB.await() }
        assertFalse(reqB.disconnected.get())
    }

    @Test
    fun cachedEndpointRetriesOnTransportFailure() = runBlocking {
        val initial = PeerConnection.pooled(url, fingerprint, "token-1", "Desktop")
        val fresh = PeerConnection.pooled("https://192.168.1.99:8443", fingerprint, "token-1", "Desktop")
        val invalidated = AtomicInteger(0)
        val reconnected = AtomicInteger(0)
        val attempts = AtomicInteger(0)

        val (used, outcome) =
            withCachedPeerEndpointRetry(
                usedCache = true,
                initial = initial,
                invalidate = { invalidated.incrementAndGet() },
                reconnect = {
                    reconnected.incrementAndGet()
                    fresh
                },
            ) { conn ->
                if (attempts.incrementAndGet() == 1) {
                    throw PeerEndpointUnreachableException(ConnectException("Connection refused"))
                }
                conn.url
            }

        assertEquals(1, invalidated.get())
        assertEquals(1, reconnected.get())
        assertEquals(2, attempts.get())
        assertSame(fresh, used)
        assertEquals("https://192.168.1.99:8443", outcome)
    }

    @Test
    fun cachedEndpointDoesNotRetryBusinessConflictOrCancellation() = runBlocking {
        val initial = PeerConnection.pooled(url, fingerprint, "token-1", "Desktop")
        val invalidated = AtomicInteger(0)
        val reconnected = AtomicInteger(0)
        val attempts = AtomicInteger(0)

        val conflictError =
            runCatching {
                    withCachedPeerEndpointRetry(
                        usedCache = true,
                        initial = initial,
                        invalidate = { invalidated.incrementAndGet() },
                        reconnect = {
                            reconnected.incrementAndGet()
                            initial
                        },
                    ) {
                        attempts.incrementAndGet()
                        error("双方版本已保留。请到电脑的「同步」处理冲突，完成后回到手机点击「同步」。")
                    }
                }
                .exceptionOrNull()

        assertTrue(conflictError is IllegalStateException)
        assertTrue(conflictError!!.message!!.contains("处理冲突"))
        assertEquals(0, invalidated.get())
        assertEquals(0, reconnected.get())
        assertEquals(1, attempts.get())

        val cancellationError =
            runCatching {
                    withCachedPeerEndpointRetry(
                        usedCache = true,
                        initial = initial,
                        invalidate = { invalidated.incrementAndGet() },
                        reconnect = {
                            reconnected.incrementAndGet()
                            initial
                        },
                    ) {
                        attempts.incrementAndGet()
                        throw CancellationException("stopped")
                    }
                }
                .exceptionOrNull()

        assertTrue(cancellationError is CancellationException)
        assertEquals(0, invalidated.get())
        assertEquals(0, reconnected.get())
        assertEquals(2, attempts.get())
    }
}
