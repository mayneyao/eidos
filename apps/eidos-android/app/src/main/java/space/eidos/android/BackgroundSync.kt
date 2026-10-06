package space.eidos.android

import android.content.Context
import androidx.work.*
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.withContext

/** Process-local editor/foreground leases. WorkManager owns persistence across process death. */
internal object BackgroundSyncGate {
    private val clients = mutableMapOf<Any, Boolean>()

    @Synchronized
    fun update(owner: Any, blocked: Boolean) {
        clients[owner] = blocked
    }

    @Synchronized
    fun remove(owner: Any) {
        clients.remove(owner)
    }

    @Synchronized fun blocked(): Boolean = clients.values.any { it }
}

object BackgroundSync {
    internal fun name(spaceId: String) = "eidos-sync-$spaceId"

    internal fun automaticName(spaceId: String) = "eidos-auto-sync-$spaceId"

    private fun preferences(context: Context, spaceId: String) =
        context.getSharedPreferences("automatic-sync-$spaceId", Context.MODE_PRIVATE)

    @Synchronized
    internal fun automaticSettings(context: Context, spaceId: String): AutomaticSyncSettings {
        val prefs = preferences(context, spaceId)
        return AutomaticSyncSettings(
            prefs.getBoolean("enabled", false),
            prefs.getString("epoch", "") ?: "",
            prefs.getString("reason", null),
        )
    }

    suspend fun setAutomatic(context: Context, spaceId: String, enabled: Boolean) =
        withContext(Dispatchers.IO) {
            val prefs = preferences(context, spaceId)
            val epoch = UUID.randomUUID().toString()
            synchronized(BackgroundSync) {
                check(
                    prefs
                        .edit()
                        .putBoolean("enabled", enabled)
                        .putString("epoch", epoch)
                        .remove("reason")
                        .commit()
                ) {
                    tr("无法保存自动同步设置")
                }
            }
            val manager = WorkManager.getInstance(context)
            if (!enabled) manager.cancelUniqueWork(automaticName(spaceId)).result.get()
            else
                try {
                    val request = automaticRequest(spaceId, epoch)
                    manager
                        .enqueueUniquePeriodicWork(
                            automaticName(spaceId),
                            ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE,
                            request,
                        )
                        .result
                        .get()
                } catch (error: Exception) {
                    pauseAutomatic(context, spaceId, tr("自动同步调度失败，请重新开启"), epoch)
                    throw error
                }
        }

    private fun automaticRequest(spaceId: String, epoch: String) =
        PeriodicWorkRequestBuilder<SpaceSyncWorker>(15, TimeUnit.MINUTES)
            .addTag("eidos-created:${System.currentTimeMillis()}")
            .setInputData(
                workDataOf("spaceId" to spaceId, "automatic" to true, "automaticEpoch" to epoch)
            )
            .setInitialDelay(15, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

    /** Repairs a process interruption between saving the preference and scheduling work. */
    suspend fun reconcileAutomatic(context: Context, spaceId: String) =
        withContext(Dispatchers.IO) {
            val operation =
                synchronized(BackgroundSync) {
                    val settings = automaticSettings(context, spaceId)
                    if (settings.enabled)
                        WorkManager.getInstance(context)
                            .enqueueUniquePeriodicWork(
                                automaticName(spaceId),
                                ExistingPeriodicWorkPolicy.UPDATE,
                                automaticRequest(spaceId, settings.epoch),
                            )
                    else WorkManager.getInstance(context).cancelUniqueWork(automaticName(spaceId))
                }
            operation.result.get()
            Unit
        }

    @Synchronized
    internal fun pauseAutomatic(
        context: Context,
        spaceId: String,
        reason: String,
        epoch: String? = null,
    ) {
        val settings = automaticSettings(context, spaceId)
        if (!settings.enabled || epoch != null && settings.epoch != epoch) return
        check(
            preferences(context, spaceId)
                .edit()
                .putBoolean("enabled", false)
                .putString("reason", reason)
                .commit()
        ) {
            tr("无法暂停自动同步")
        }
        WorkManager.getInstance(context).cancelUniqueWork(automaticName(spaceId))
    }

    fun observeAutomatic(context: Context, spaceId: String): Flow<AutomaticSyncState> {
        val settings = callbackFlow {
            val prefs = preferences(context, spaceId)
            val listener =
                android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, _ ->
                    trySend(automaticSettings(context, spaceId))
                }
            prefs.registerOnSharedPreferenceChangeListener(listener)
            trySend(automaticSettings(context, spaceId))
            awaitClose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
        }
        return combine(
            settings,
            WorkManager.getInstance(context).getWorkInfosForUniqueWorkFlow(automaticName(spaceId)),
        ) { config, infos ->
            val message =
                config.reason
                    ?: if (config.enabled)
                        backgroundSyncState(
                                infos,
                                BackgroundSyncDetails(context, spaceId, automatic = true),
                            )
                            ?.message ?: tr("等待 Android 调度自动同步")
                    else tr("自动同步已关闭")
            AutomaticSyncState(config.enabled, message)
        }
    }

    suspend fun enqueue(context: Context, spaceId: String) =
        withContext(Dispatchers.IO) {
            val work =
                OneTimeWorkRequestBuilder<SpaceSyncWorker>()
                    .addTag("eidos-created:${System.currentTimeMillis()}")
                    .setInputData(workDataOf("spaceId" to spaceId))
                    .setConstraints(
                        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
                    )
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(name(spaceId), ExistingWorkPolicy.KEEP, work)
                .result
                .get()
        }

    fun cancel(context: Context, spaceId: String) {
        WorkManager.getInstance(context).cancelUniqueWork(name(spaceId))
    }

    fun observe(context: Context, spaceId: String): Flow<List<WorkInfo>> =
        WorkManager.getInstance(context).getWorkInfosForUniqueWorkFlow(name(spaceId))
}

internal data class AutomaticSyncSettings(
    val enabled: Boolean,
    val epoch: String,
    val reason: String?,
)

data class AutomaticSyncState(val enabled: Boolean = false, val message: String = tr("自动同步已关闭"))

data class BackgroundSyncState(val state: String, val message: String) {
    val pending: Boolean
        get() = state in setOf("ENQUEUED", "RUNNING", "BLOCKED")
}

internal class BackgroundSyncDetails(
    context: Context,
    spaceId: String,
    automatic: Boolean = false,
) {
    private val prefs =
        context.getSharedPreferences(
            "background-sync-$spaceId${if (automatic) "-auto" else ""}",
            Context.MODE_PRIVATE,
        )

    fun message(id: String): String? =
        if (prefs.getString("id", null) == id) prefs.getString("message", null) else null

    fun record(
        id: String,
        message: String,
        failed: Boolean = false,
        resetFailures: Boolean = false,
    ): Int {
        val failures =
            (if (!resetFailures && prefs.getString("id", null) == id) prefs.getInt("failures", 0)
            else 0) + if (failed) 1 else 0
        check(
            prefs
                .edit()
                .putString("id", id)
                .putString("message", message)
                .putInt("failures", failures)
                .commit()
        ) {
            tr("无法保存后台同步状态")
        }
        return failures
    }
}

internal fun backgroundSyncState(
    infos: List<WorkInfo>,
    details: BackgroundSyncDetails? = null,
): BackgroundSyncState? {
    val info =
        infos.maxByOrNull { work ->
            work.tags
                .firstOrNull { it.startsWith("eidos-created:") }
                ?.substringAfter(':')
                ?.toLongOrNull() ?: 0
        } ?: return null
    val message =
        if (info.state.isFinished) info.outputData.getString("message")
        else info.progress.getString("message") ?: details?.message(info.id.toString())
    return BackgroundSyncState(
        info.state.name,
        message
            ?: when (info.state) {
                WorkInfo.State.ENQUEUED,
                WorkInfo.State.BLOCKED -> tr("等待网络和后台运行条件")
                WorkInfo.State.RUNNING -> tr("后台同步中")
                WorkInfo.State.SUCCEEDED -> tr("后台同步已完成")
                WorkInfo.State.CANCELLED -> tr("后台同步已取消")
                else -> tr("后台同步失败，请检查连接后重试")
            },
    )
}

private class SyncForegroundUnavailable(cause: Exception) :
    IllegalStateException(tr("Android 暂时无法启动同步服务"), cause)

class SpaceSyncWorker(context: Context, parameters: WorkerParameters) :
    CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val spaceId = inputData.getString("spaceId") ?: return Result.failure()
        if (SpaceCatalog(applicationContext).spaces().none { it.id == spaceId })
            return Result.failure(workDataOf("message" to tr("Space 已不存在")))
        val automatic = inputData.getBoolean("automatic", false)
        val epoch = inputData.getString("automaticEpoch")
        val settings = BackgroundSync.automaticSettings(applicationContext, spaceId)
        if (automatic && (!settings.enabled || settings.epoch != epoch)) return Result.success()
        val details = BackgroundSyncDetails(applicationContext, spaceId, automatic)
        suspend fun progress(message: String) {
            details.record(id.toString(), message)
            setProgress(workDataOf("message" to message))
        }
        try {
            val outcome =
                SpaceRepository(applicationContext, spaceId).syncInBackground { phase ->
                    try {
                        setForeground(
                            SyncNotification.foreground(
                                applicationContext,
                                id,
                                spaceId,
                                if (automatic) epoch else null,
                                phase,
                            )
                        )
                    } catch (error: Exception) {
                        currentCoroutineContext().ensureActive()
                        throw SyncForegroundUnavailable(error)
                    }
                    progress(phase)
                }
            return when (outcome) {
                "deferred" -> {
                    progress(tr("等待退出编辑并离开应用"))
                    Result.retry()
                }
                "needs_merge" -> {
                    val message = tr("双方都有新版本，需要合并；本地与远端版本均已保留")
                    BackgroundSync.pauseAutomatic(
                        applicationContext,
                        spaceId,
                        tr("自动同步已暂停：{0}", message),
                        if (automatic) epoch else null,
                    )
                    Result.failure(workDataOf("message" to message))
                }
                else -> {
                    details.record(
                        id.toString(),
                        if (automatic) tr("自动同步已完成，等待下一轮") else tr("后台同步已完成"),
                        resetFailures = true,
                    )
                    Result.success(workDataOf("message" to tr("后台同步已完成")))
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            // JNI can surface cancellation as a Graft error before the suspension resumes.
            // Stopping a worker must not count as failure or disable automatic sync.
            currentCoroutineContext().ensureActive()
            val retryable =
                error is SyncForegroundUnavailable ||
                    error is GraftException &&
                        error.code in
                            setOf(
                                "GRAFT_SDK_REMOTE_TRANSPORT_TIMEOUT",
                                "GRAFT_SDK_REPOSITORY_BUSY",
                                "GRAFT_SDK_REPOSITORY_COMMAND",
                            )
            val message = (error.message ?: tr("同步失败")).take(1500)
            val failures = details.record(id.toString(), message, failed = true)
            if (retryable && failures <= 5) {
                progress(tr("第 {0} 次同步未完成，将自动重试：{1}", failures, message))
                return Result.retry()
            }
            if (automatic)
                BackgroundSync.pauseAutomatic(
                    applicationContext,
                    spaceId,
                    tr("自动同步已暂停：{0}", message),
                    epoch,
                )
            return Result.failure(workDataOf("message" to message))
        }
    }
}
