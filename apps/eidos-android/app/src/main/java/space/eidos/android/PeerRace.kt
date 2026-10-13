package space.eidos.android

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/** Return the first verified result, never the first failure. Cancel losing probes. */
internal suspend fun <T : Any> firstPeerResult(probes: List<suspend () -> T?>): T? = coroutineScope {
    val results = Channel<T?>(probes.size.coerceAtLeast(1))
    val jobs = probes.map { probe ->
        launch {
            val result =
                try {
                    probe()
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    null
                }
            results.send(result)
        }
    }
    try {
        repeat(probes.size) { results.receive()?.let { return@coroutineScope it } }
        null
    } finally {
        jobs.forEach { it.cancel() }
    }
}
