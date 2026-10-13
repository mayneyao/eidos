package space.eidos.android

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch

/** Foreground-only signals. Discovery hints trigger pinned verification, never online status. */
internal fun peerPresenceChanges(context: Context) = callbackFlow {
    val nsd = context.getSystemService(NsdManager::class.java)
    val network = context.getSystemService(ConnectivityManager::class.java)
    val listener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(type: String) { trySend(Unit) }
        override fun onDiscoveryStopped(type: String) {}
        override fun onStartDiscoveryFailed(type: String, code: Int) {}
        override fun onStopDiscoveryFailed(type: String, code: Int) {}
        override fun onServiceFound(service: NsdServiceInfo) { trySend(Unit) }
        override fun onServiceLost(service: NsdServiceInfo) { trySend(Unit) }
    }
    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(value: Network) { trySend(Unit) }
        override fun onLost(value: Network) { trySend(Unit) }
        override fun onLinkPropertiesChanged(value: Network, properties: LinkProperties) { trySend(Unit) }
    }
    runCatching { nsd.discoverServices(PeerDiscovery.SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener) }
    runCatching { network.registerDefaultNetworkCallback(callback) }
    trySend(Unit)
    val fallback = launch { while (true) { delay(20_000); trySend(Unit) } }
    awaitClose {
        fallback.cancel()
        runCatching { nsd.stopServiceDiscovery(listener) }
        runCatching { network.unregisterNetworkCallback(callback) }
    }
}.buffer(Channel.CONFLATED)
