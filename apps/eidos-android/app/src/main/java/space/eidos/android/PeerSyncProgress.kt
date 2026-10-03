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
    val stage: String = "正在寻找并连接电脑",
    val startedAt: Long = SystemClock.elapsedRealtime(),
    val finishedAt: Long? = null,
    val received: Long = 0,
    val sent: Long = 0,
    val error: String? = null,
)

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
            Text(progress.stage, style = MaterialTheme.typography.titleMedium)
            Box(Modifier.fillMaxWidth().height(4.dp)) {
                if (progress.finishedAt == null) LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            Text("已用时 ${seconds / 60}分 ${seconds % 60}秒")
            Text(
                "已接收 ${Formatter.formatShortFileSize(context, progress.received)} · 已发送 ${Formatter.formatShortFileSize(context, progress.sent)}"
            )
            Text(
                progress.error
                    ?: if (progress.finishedAt != null) "本地文件已更新，可离线使用"
                    else "收发量为网络传输量。总量尚不可用，暂无法预估剩余时间。",
                style = MaterialTheme.typography.bodySmall,
                color =
                    if (progress.error != null) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
