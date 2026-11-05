package space.eidos.android

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

/** Pull only; never invokes the manual checkpoint/publish/merge workflow. */
internal object PeerAutoSync {
    private const val periodic = "eidos-lan-updates"
    private val running = Mutex()
    val changes = kotlinx.coroutines.flow.MutableSharedFlow<String>(extraBufferCapacity = 32)

    fun schedule(context: Context, soon: Boolean = false) {
        val manager = WorkManager.getInstance(context)
        if (SpaceCatalog(context).peerLocalSpaces().isEmpty()) {
            manager.cancelUniqueWork(periodic)
            return
        }
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.UNMETERED).build()
        manager.enqueueUniquePeriodicWork(periodic, ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<PeerAutoSyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints).build())
        if (soon) manager.enqueueUniqueWork("$periodic-now", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<PeerAutoSyncWorker>().setConstraints(constraints).build())
    }

    suspend fun pull(context: Context): Set<String> = withContext(Dispatchers.IO) {
        if (!running.tryLock()) return@withContext emptySet()
        try {
            val changed = mutableSetOf<String>()
            // Each association retains its device fingerprint and remote Space ID.
            // Failure on one device must not prevent other paired devices updating.
            val spaces = SpaceCatalog(context).peerLocalSpaces()
            val prefs = context.getSharedPreferences("peer-auto-sync", Context.MODE_PRIVATE)
            val start = if (spaces.isEmpty()) 0 else prefs.getInt("cursor", 0).mod(spaces.size)
            if (spaces.isNotEmpty()) prefs.edit().putInt("cursor", (start + 1).mod(spaces.size)).apply()
            for (local in spaces.drop(start) + spaces.take(start)) {
                val lease = BackgroundSyncGate.lanLease() ?: break
                try {
                    withTimeout(30_000) {
                        val saved = PeerConnection.load(context, local.id) ?: return@withTimeout
                        if (saved.fingerprint != local.fingerprint) return@withTimeout
                        val connection = PeerConnection.reconnect(context, saved, local.remoteId)
                        val outcome = SpaceRepository(context, local.id).pullPeerUpdates(connection, local.remoteId) {
                            BackgroundSyncGate.lanAllowed(lease)
                        }
                        if (outcome == "updated") {
                            changed.add(local.id)
                            runCatching { SpaceCatalog(context).recordPeerSync(local.id) }
                            changes.tryEmit(local.id)
                        }
                    }
                } catch (error: kotlinx.coroutines.TimeoutCancellationException) {
                    // Bounded best-effort attempt. A future foreground/worker run retries.
                    kotlinx.coroutines.currentCoroutineContext().ensureActive()
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    // Offline, revoked, old gateway, dirty and diverged histories stay local.
                }
            }
            changed
        } finally { running.unlock() }
    }
}

class PeerAutoSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        return try {
            withTimeout(120_000) { PeerAutoSync.pull(applicationContext) }
            Result.success()
        } catch (error: CancellationException) { throw error }
        catch (_: Exception) { Result.retry() }
    }
}
