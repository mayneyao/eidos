package space.eidos.android

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import java.net.Inet4Address
import kotlin.coroutines.resume
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

/** Discovery metadata is untrusted. Verify TLS before saving or using an endpoint. */
internal object PeerDiscovery {
    const val SERVICE_TYPE = "_eidos-peer._tcp."

    fun endpoint(service: NsdServiceInfo, fingerprint: String, space: String?): String? {
        val attributes = service.attributes
        if (
            attributes["v"]?.toString(Charsets.UTF_8) != "1" ||
                attributes["fingerprint"]?.toString(Charsets.UTF_8) != fingerprint ||
                (space != null && attributes["space"]?.toString(Charsets.UTF_8) != space)
        )
            return null
        val host = service.host ?: return null
        if (host !is Inet4Address || !host.isSiteLocalAddress || service.port !in 1..65535)
            return null
        return "https://${host.hostAddress}:${service.port}"
    }

    @Suppress("DEPRECATION")
    suspend fun <T : Any> find(
        context: Context,
        fingerprint: String,
        space: String?,
        verify: suspend (String) -> T?,
    ): T? {
        val manager = context.getSystemService(NsdManager::class.java)
        val found = Channel<NsdServiceInfo>(32)
        val listener =
            object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(type: String) {}

                override fun onDiscoveryStopped(type: String) {
                    found.close()
                }

                override fun onStartDiscoveryFailed(type: String, code: Int) {
                    found.close()
                }

                override fun onStopDiscoveryFailed(type: String, code: Int) {
                    found.close()
                }

                override fun onServiceLost(service: NsdServiceInfo) {}

                override fun onServiceFound(service: NsdServiceInfo) {
                    if (service.serviceType.trimEnd('.') == SERVICE_TYPE.trimEnd('.'))
                        found.trySend(service)
                }
            }
        try {
            manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
            return withTimeoutOrNull(8000) {
                // Resolve serially: older Android NSD implementations allow one resolution at a
                // time.
                for (service in found) {
                    val resolved =
                        suspendCancellableCoroutine<NsdServiceInfo?> { continuation ->
                            val resolver =
                                object : NsdManager.ResolveListener {
                                    override fun onResolveFailed(info: NsdServiceInfo, code: Int) {
                                        if (continuation.isActive) continuation.resume(null)
                                    }

                                    override fun onServiceResolved(info: NsdServiceInfo) {
                                        if (continuation.isActive) continuation.resume(info)
                                    }
                                }
                            try {
                                manager.resolveService(service, resolver)
                            } catch (_: Exception) {
                                if (continuation.isActive) continuation.resume(null)
                            }
                        } ?: continue
                    val url = endpoint(resolved, fingerprint, space) ?: continue
                    verify(url)?.let {
                        return@withTimeoutOrNull it
                    }
                }
                null
            }
        } finally {
            runCatching { manager.stopServiceDiscovery(listener) }
            found.close()
        }
    }
}
