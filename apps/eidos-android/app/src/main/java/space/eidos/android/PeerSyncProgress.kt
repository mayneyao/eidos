package space.eidos.android

import android.os.SystemClock
import android.text.format.Formatter
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

data class PeerSyncProgress(
    val spaceName: String = "",
    val stage: String = tr("正在寻找并连接电脑"),
    val startedAt: Long = SystemClock.elapsedRealtime(),
    val finishedAt: Long? = null,
    val received: Long = 0,
    val sent: Long = 0,
    val error: String? = null,
    val fingerprint: String? = null,
    val remoteId: String? = null,
    val downloadBytes: Long = 0,
    val downloadTotal: Long? = null,
    val downloadPlanned: Boolean = false,
    val uploadBytes: Long = 0,
    val uploadTotal: Long? = null,
    val uploadPlanned: Boolean = false,
    val warning: String? = null,
)

// Only the native download plan determines when the manifest is complete.
// Late progress polls must never move local application back into downloading.
internal fun peerDownloadStage(stage: String, planned: Boolean): String =
    if (stage == "获取清单" || stage == "下载数据") {
        if (planned) "下载数据" else "获取清单"
    } else stage

internal fun PeerSyncProgress.transferFraction(): Float? {
    val (bytes, total) = when (stage) {
        "下载数据" -> if (downloadPlanned) downloadBytes to downloadTotal else return null
        "发送本机版本" -> if (uploadPlanned) uploadBytes to uploadTotal else return null
        else -> return null
    }
    return total?.takeIf { it > 0 }?.let { (bytes.toDouble() / it).coerceIn(0.0, 1.0).toFloat() }
}

@Composable
internal fun PeerTransferStatus(progress: PeerSyncProgress) {
    val context = LocalContext.current
    val fraction = progress.transferFraction()
    if (fraction != null) {
        val downloading = progress.stage != "发送本机版本"
        val bytes = if (downloading) progress.downloadBytes else progress.uploadBytes
        val total = if (downloading) progress.downloadTotal!! else progress.uploadTotal!!
        LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth())
        Text("${tr(if (downloading) "下载" else "上传")} ${(fraction * 100).toInt()}% · ${Formatter.formatShortFileSize(context, bytes)} / ${Formatter.formatShortFileSize(context, total)}",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
        LinearProgressIndicator(Modifier.fillMaxWidth())
        if (progress.stage == "获取清单")
            Text(tr("正在计算本次下载总量"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (progress.received > 0 || progress.sent > 0)
            Text(tr("已接收 {0} · 已发送 {1}", Formatter.formatShortFileSize(context, progress.received), Formatter.formatShortFileSize(context, progress.sent)),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
internal fun PeerSyncProgressView(progress: PeerSyncProgress) {
    var now by remember(progress.startedAt) { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(progress.startedAt, progress.finishedAt) {
        while (progress.finishedAt == null) {
            now = SystemClock.elapsedRealtime()
            delay(1000)
        }
    }
    val context = LocalContext.current
    val seconds = ((progress.finishedAt ?: now) - progress.startedAt).coerceAtLeast(0) / 1000
    Surface(tonalElevation = 1.dp, shape = MaterialTheme.shapes.medium) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (progress.spaceName.isNotBlank())
                Text(progress.spaceName, style = MaterialTheme.typography.labelLarge)
            Text(tr(progress.stage), style = MaterialTheme.typography.titleMedium)
            Box(Modifier.fillMaxWidth().height(4.dp)) {
                if (progress.finishedAt == null) {
                    val fraction = progress.transferFraction()
                    if (fraction != null) LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth())
                    else LinearProgressIndicator(Modifier.fillMaxWidth())
                }
            }
            Text(tr("已用时 {0}分 {1}秒", seconds / 60, seconds % 60))
            Text(
                tr("已接收 {0} · 已发送 {1}", Formatter.formatShortFileSize(context, progress.received), Formatter.formatShortFileSize(context, progress.sent))
            )
            Text(
                progress.error
                    ?: if (progress.finishedAt != null) tr("本地文件已更新，可离线使用")
                    else when {
                        progress.stage == "获取清单" -> tr("正在获取版本清单并计算下载总量")
                        progress.stage == "写入文件" -> tr("数据已下载，正在应用快照并写入文件")
                        progress.stage == "正在完成下载" -> tr("文件已写入，正在更新 Space 列表")
                        else -> progress.transferFraction()?.let { tr("传输 {0}%", (it * 100).toInt()) } ?: tr("正在准备同步")
                    },
                style = MaterialTheme.typography.bodySmall,
                color =
                    if (progress.error != null) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
