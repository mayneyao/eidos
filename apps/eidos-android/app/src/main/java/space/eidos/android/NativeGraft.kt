package space.eidos.android

import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONObject

class GraftException(val code: String, message: String) : IllegalStateException(message)

/** Shares the Space repository's IO mutex with file writes and Runtime calls. */
object NativeGraft {
    init {
        System.loadLibrary("eidos_mobile_host")
    }

    @JvmStatic external fun execute(root: String, method: String, request: String): String

    @JvmStatic external fun beginCancellation(id: String): Boolean

    @JvmStatic external fun cancel(id: String)

    @JvmStatic external fun endCancellation(id: String)

    @JvmStatic external fun downloadedBytes(id: String): Long
    @JvmStatic external fun transferProgress(id: String): String

    suspend fun <T> cancellable(
        onDownload: ((Long) -> Unit)? = null,
        onTransfer: ((JSONObject) -> Unit)? = null,
        action: suspend (String) -> T,
    ): T = coroutineScope {
        val id = UUID.randomUUID().toString()
        check(beginCancellation(id)) { tr("无法创建可取消的同步操作") }
        val watcher =
            launch(Dispatchers.Default, start = CoroutineStart.UNDISPATCHED) {
                try {
                    awaitCancellation()
                } finally {
                    NativeGraft.cancel(id)
                }
            }
        val progress =
            if (onDownload != null || onTransfer != null)
                launch(Dispatchers.Default) {
                    while (isActive) {
                        if (onDownload != null) downloadedBytes(id).takeIf { it >= 0 }?.let(onDownload)
                        if (onTransfer != null) transferProgress(id).takeIf { it != "null" }?.let { onTransfer(JSONObject(it)) }
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
                if (onTransfer != null) transferProgress(id).takeIf { it != "null" }?.let { onTransfer(JSONObject(it)) }
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
        val started = android.os.SystemClock.elapsedRealtime()
        val payload =
            if (cancellationId == null) request
            else JSONObject(request.toString()).put("_androidCancellation", cancellationId)
        val envelope = JSONObject(execute(root, method, payload.toString()))
        if (!envelope.optBoolean("ok"))
            throw GraftException(
                envelope.optString("code", "ANDROID_GRAFT_ERROR"),
                envelope.optString("error", tr("版本操作失败")),
            )
        return envelope.getJSONObject("value").also { value ->
            if (BuildConfig.DEBUG) {
                android.util.Log.d(
                    "GraftTiming",
                    "$method ${android.os.SystemClock.elapsedRealtime() - started}ms stages_ms=${value.optJSONObject("timing_ms")}",
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

data class LocalVersion(val id: String, val message: String)
