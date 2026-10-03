package space.eidos.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GraftCancellationTest {
    @Test
    fun cancellationInterruptsAnInFlightRequestAndReleasesTheRepository(): Unit = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val root = File(context.cacheDir, "cancel-${UUID.randomUUID()}").apply { mkdirs() }
        val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        val received = CountDownLatch(1)
        val release = CountDownLatch(1)
        val serverThread =
            Thread {
                    try {
                        server.accept().use { socket ->
                            socket.soTimeout = 10_000
                            socket.getInputStream().bufferedReader().readLine()
                            received.countDown()
                            // Hold a real HTTP request until the client has requested cancellation.
                            release.await(15, TimeUnit.SECONDS)
                        }
                    } catch (_: Exception) {
                        // Closing the test listener also unblocks accept on setup failure.
                    }
                }
                .apply { start() }
        var task: Job? = null
        try {
            File(root, "note.md").writeText("local content")
            NativeGraft.call(root.path, "checkpoint")
            NativeGraft.call(
                root.path,
                "configureRemote",
                JSONObject().put("url", "graft+http://127.0.0.1:${server.localPort}/test/cancel"),
            )
            task =
                launch(Dispatchers.IO) {
                    NativeGraft.cancellable { id ->
                        NativeGraft.call(root.path, "fetch", cancellationId = id)
                    }
                }
            assertTrue("Fetch never reached the HTTP server", received.await(10, TimeUnit.SECONDS))
            task.cancel()
            withTimeout(5_000) { task.join() }
            assertTrue(task.isCancelled)
            assertEquals("local content", File(root, "note.md").readText())
            // A fresh operation must not inherit the cancelled token or a held native mutex.
            NativeGraft.cancellable { id ->
                NativeGraft.call(root.path, "checkpoint", cancellationId = id)
            }
        } finally {
            release.countDown()
            server.close()
            withContext(NonCancellable) { task?.cancelAndJoin() }
            serverThread.join(2_000)
            NativeGraft.call(root.path, "close")
            root.deleteRecursively()
        }
    }
}
