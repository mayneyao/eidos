package space.eidos.android

import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class PeerLifecycleTest {
    @Test
    fun tunnelWaitsForCapacityAndCancellationClosesQueuedSocket() {
        val server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
        val upstream = java.util.Collections.synchronizedList(mutableListOf<Socket>())
        val occupied = CountDownLatch(8)
        val resumed = CountDownLatch(1)
        val accepting = kotlin.concurrent.thread {
            try {
                repeat(9) { index ->
                    upstream.add(server.accept())
                    if (index < 8) occupied.countDown() else resumed.countDown()
                }
            } catch (_: java.net.SocketException) { }
        }
        val connection = PeerConnection("https://127.0.0.1:${server.localPort}", "0".repeat(64), "disposable", "Test")
        val tunnel = connection.tunnel()
        val port = java.net.URI(tunnel.remoteUrl.removePrefix("graft+")).port
        val clients = mutableListOf<Socket>()
        try {
            repeat(8) { clients.add(Socket("127.0.0.1", port)) }
            assertTrue("Eight upstream connections must occupy the relay", occupied.await(5, TimeUnit.SECONDS))
            val queued = Socket("127.0.0.1", port).also { clients.add(it); it.soTimeout = 200 }
            val pending = runCatching { queued.getInputStream().read() }
            assertTrue("Capacity must wait rather than close the request", pending.exceptionOrNull() is java.net.SocketTimeoutException)
            upstream[0].close()
            assertTrue("Waiting request must continue when a slot is released", resumed.await(3, TimeUnit.SECONDS))
            val cancelled = Socket("127.0.0.1", port).also { clients.add(it); it.soTimeout = 200 }
            assertTrue(runCatching { cancelled.getInputStream().read() }.exceptionOrNull() is java.net.SocketTimeoutException)
            cancelled.soTimeout = 1000
            tunnel.close()
            val closed = runCatching { cancelled.getInputStream().read() }
            assertTrue("Stopping must close queued sockets: $closed", closed.getOrNull() == -1 || closed.exceptionOrNull() is java.net.SocketException)
        } finally {
            tunnel.close()
            clients.forEach { it.close() }
            server.close()
            synchronized(upstream) { upstream.forEach { it.close() } }
            accepting.join(1000)
        }
    }

    @Test
    fun stoppingDiscoveryReleasesItsCoroutine() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val entered = CountDownLatch(1)
        val stopped = CountDownLatch(1)
        val discovery = scope.launch {
            entered.countDown()
            PeerDiscovery.find(app, java.util.UUID.randomUUID().toString(), null) { it }
        }
        discovery.invokeOnCompletion { stopped.countDown() }
        try {
            assertTrue(entered.await(1, TimeUnit.SECONDS))
            discovery.cancel()
            assertTrue("Stopping must release discovery", stopped.await(1, TimeUnit.SECONDS))
            assertTrue(discovery.isCancelled)
        } finally { scope.cancel(); runBlocking { discovery.join() } }
    }
    @Test
    fun stoppingReconnectInterruptsTheAddressProbe() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val entered = CountDownLatch(1)
        val stopped = CountDownLatch(1)
        var socket: Socket? = null
        val accepted = scope.launch { socket = server.accept(); entered.countDown() }
        val saved = PeerConnection("https://127.0.0.1:${server.localPort}", "0".repeat(64), "disposable", "Computer")
        val reconnect = scope.launch { PeerConnection.reconnect(app, saved) }
        reconnect.invokeOnCompletion { stopped.countDown() }
        try {
            assertTrue(entered.await(3, TimeUnit.SECONDS))
            reconnect.cancel()
            assertTrue("Cancellation must stop the address probe", stopped.await(1, TimeUnit.SECONDS))
            assertTrue(reconnect.isCancelled)
        } finally {
            socket?.close(); server.close(); scope.cancel()
            runBlocking { reconnect.join(); accepted.join() }
        }
    }
    @Test
    fun stoppingAnActivePeerRequestReleasesItsCoroutine() {
        val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val entered = CountDownLatch(1)
        val stopped = CountDownLatch(1)
        var socket: Socket? = null
        val accepted = scope.launch {
            socket = server.accept()
            entered.countDown()
        }
        val connection = PeerConnection(
            "https://127.0.0.1:${server.localPort}", "0".repeat(64), "disposable", "Test computer",
        )
        val request = scope.launch {
            connection.cancellable { runCatching { connection.call("/sync", timeoutMillis = 15000) } }
        }
        request.invokeOnCompletion { stopped.countDown() }
        try {
            assertTrue("Peer request did not connect", entered.await(3, TimeUnit.SECONDS))
            request.cancel()
            assertTrue("Cancellation must release the blocked peer request", stopped.await(1, TimeUnit.SECONDS))
            assertTrue(request.isCancelled)
        } finally {
            socket?.close()
            server.close()
            scope.cancel()
            runBlocking { request.join(); accepted.join() }
        }
    }
}
