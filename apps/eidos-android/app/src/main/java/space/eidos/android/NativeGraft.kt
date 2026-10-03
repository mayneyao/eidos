package space.eidos.android

import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONObject

class GraftException(val code: String, message: String) : IllegalStateException(message)

/** Shares the Space repository's IO mutex with file writes and Runtime calls. */
object NativeGraft {
    init {
        System.loadLibrary("eidos_android_host")
    }

    @JvmStatic external fun execute(root: String, method: String, request: String): String

    @JvmStatic external fun beginCancellation(id: String): Boolean

    @JvmStatic external fun cancel(id: String)

    @JvmStatic external fun endCancellation(id: String)

    @JvmStatic external fun downloadedBytes(id: String): Long

    suspend fun <T> cancellable(
        onDownload: ((Long) -> Unit)? = null,
        action: suspend (String) -> T,
    ): T = coroutineScope {
        val id = UUID.randomUUID().toString()
        check(beginCancellation(id)) { "无法创建可取消的同步操作" }
        val watcher =
            launch(Dispatchers.Default, start = CoroutineStart.UNDISPATCHED) {
                try {
                    awaitCancellation()
                } finally {
                    NativeGraft.cancel(id)
                }
            }
        val progress =
            if (onDownload != null)
                launch(Dispatchers.Default) {
                    while (isActive) {
                        downloadedBytes(id).takeIf { it >= 0 }?.let(onDownload)
                        delay(200)
                    }
                }
            else null
        try {
            action(id).also { currentCoroutineContext().ensureActive() }
        } catch (error: Exception) {
            currentCoroutineContext().ensureActive()
            throw error
        } finally {
            withContext(NonCancellable) {
                progress?.cancelAndJoin()
                if (onDownload != null) downloadedBytes(id).takeIf { it >= 0 }?.let(onDownload)
                watcher.cancelAndJoin()
                endCancellation(id)
            }
        }
    }

    fun call(
        root: String,
        method: String,
        request: JSONObject = JSONObject(),
        cancellationId: String? = null,
    ): JSONObject {
        val payload =
            if (cancellationId == null) request
            else JSONObject(request.toString()).put("_androidCancellation", cancellationId)
        val envelope = JSONObject(execute(root, method, payload.toString()))
        if (!envelope.optBoolean("ok"))
            throw GraftException(
                envelope.optString("code", "ANDROID_GRAFT_ERROR"),
                envelope.optString("error", "版本操作失败"),
            )
        return envelope.getJSONObject("value").also { value ->
            if (BuildConfig.DEBUG && method == "checkpoint") {
                android.util.Log.d(
                    "CheckpointPerf",
                    "stages_ms=${value.optJSONObject("timing_ms")}",
                )
            }
        }
    }
}

data class GraftState(
    val initialized: Boolean,
    val dirty: Boolean,
    val remoteUrl: String? = null,
    val syncStatus: String = "local",
)

internal fun homeSyncMessage(
    graft: GraftState?,
    background: BackgroundSyncState?,
    syncing: Boolean,
    merging: Boolean,
    peerName: String? = null,
): String =
    when {
        merging -> "需要合并 · 本地资料仍可离线使用"
        syncing -> "正在同步 · 本地资料仍可离线使用"
        graft?.remoteUrl == null && peerName != null ->
            if (graft?.dirty == true) "有本地修改 · 到同步页发送到 $peerName" else "与 $peerName 手动同步 · 文件保存在本机"
        graft?.remoteUrl == null -> "本地 Space · 可离线使用"
        background?.pending == true -> "后台同步待完成 · 本地资料仍可离线使用"
        graft.syncStatus == "needs_merge" -> "需要合并 · 本地资料仍可离线使用"
        graft.syncStatus == "failed" -> "同步失败 · 本地资料仍可离线使用"
        graft.syncStatus == "interrupted" -> "上次同步中断 · 本地资料仍可离线使用"
        graft.syncStatus == "completed" -> "上次同步已完成 · 完整保存在本机"
        else -> "待同步 · 本地资料仍可离线使用"
    }
