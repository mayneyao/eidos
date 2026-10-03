package space.eidos.android

import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject

data class PendingClone(val space: LocalSpace, val ready: Boolean)

data class DownloadProgress(
    val name: String,
    val stage: String = "准备下载",
    val receivedBytes: Long = 0,
)

/** Durable registration boundary. Credentials use the existing encrypted profile store. */
class CloneJournal(private val context: Context) {
    private val prefs = context.getSharedPreferences("pending-clone", Context.MODE_PRIVATE)

    fun pending(): PendingClone? {
        val raw = prefs.getString("job", null) ?: return null
        val value = JSONObject(raw)
        val id = value.getString("id")
        require(id.matches(Regex("space-[0-9a-f-]{36}"))) { "下载记录无效" }
        return PendingClone(LocalSpace(id, value.getString("name")), value.getBoolean("ready"))
    }

    private fun save(job: PendingClone) {
        check(
            prefs
                .edit()
                .putString(
                    "job",
                    JSONObject()
                        .put("id", job.space.id)
                        .put("name", job.space.name)
                        .put("ready", job.ready)
                        .toString(),
                )
                .commit()
        ) {
            "无法保存下载进度"
        }
    }

    private fun clear() {
        check(prefs.edit().remove("job").commit()) { "无法清除下载记录" }
    }

    suspend fun download(
        name: String,
        url: String,
        token: String,
        progress: (DownloadProgress) -> Unit = {},
    ): LocalSpace =
        withContext(Dispatchers.IO) {
            lock.withLock {
                check(pending() == null) { "请先处理尚未完成的下载" }
                val space = SpaceCatalog(context).prepare(name)
                val profiles = SyncProfileStore(context, space.id)
                val profile = profiles.validate(url, token)
                profiles.save(profile)
                val job = PendingClone(space, false)
                try {
                    save(job)
                } catch (error: Exception) {
                    try {
                        profiles.clear()
                    } catch (cleanup: Exception) {
                        error.addSuppressed(cleanup)
                    }
                    throw error
                }
                run(job, profile, progress)
            }
        }

    suspend fun resume(expectedId: String, progress: (DownloadProgress) -> Unit = {}): LocalSpace =
        withContext(Dispatchers.IO) {
            lock.withLock {
                val job = checkNotNull(pending()) { "没有待恢复的下载" }
                check(job.space.id == expectedId) { "下载记录已变化，请重新打开" }
                if (job.ready || SpaceCatalog(context).spaces().any { it.id == job.space.id })
                    return@withLock register(job)
                val profile =
                    checkNotNull(SyncProfileStore(context, job.space.id).load()) {
                        "下载凭证不可用，请取消后重新连接"
                    }
                // The current SDK has no partial-clone resume API. Restart only the
                // unregistered download root; never reinterpret partial bytes as complete.
                SpaceRepository(context, job.space.id).discardPendingClone(clearCredentials = false)
                run(job, profile, progress)
            }
        }

    suspend fun discard(expectedId: String) =
        withContext(Dispatchers.IO) {
            lock.withLock {
                val job = pending() ?: return@withLock
                check(job.space.id == expectedId) { "下载记录已变化，请重新打开" }
                if (SpaceCatalog(context).spaces().none { it.id == job.space.id })
                    SpaceRepository(context, job.space.id).discardPendingClone()
                clear()
            }
        }

    private suspend fun run(
        job: PendingClone,
        profile: SyncProfile,
        progress: (DownloadProgress) -> Unit,
    ): LocalSpace {
        try {
            SpaceRepository(context, job.space.id).cloneRemote(profile.url, profile.token) {
                stage,
                bytes ->
                progress(DownloadProgress(job.space.name, stage, bytes))
            }
            progress(DownloadProgress(job.space.name, "正在导入本机 Space"))
            save(job.copy(ready = true))
            return register(job.copy(ready = true))
        } catch (error: CancellationException) {
            throw error // Retain the journal for the next launch.
        } catch (error: Exception) {
            // Once the ready marker is durable, registration can be retried without network.
            if (pending()?.ready != true)
                withContext(NonCancellable) {
                    try {
                        SpaceRepository(context, job.space.id).discardPendingClone()
                        clear()
                    } catch (cleanup: Exception) {
                        error.addSuppressed(cleanup)
                    }
                }
            throw error
        }
    }

    private fun register(job: PendingClone): LocalSpace {
        val catalog = SpaceCatalog(context)
        val existing = catalog.spaces().firstOrNull { it.id == job.space.id }
        check(job.ready || existing != null) { "下载尚未完成" }
        val space = existing ?: catalog.register(job.space)
        clear()
        return space
    }

    private companion object {
        val lock = Mutex()
    }
}
