package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** Reserve the same space before, during and after transfer. The SDK has no fixed clone total. */
@Composable
internal fun DownloadProgressView(progress: DownloadProgress?) {
    Column(
        Modifier.fillMaxWidth().heightIn(min = 88.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        LoadingIndicator(progress != null)
        if (progress != null) {
            Text(
                tr(progress.stage),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            Text(
                tr("已接收 ") +
                    android.text.format.Formatter.formatFileSize(
                        LocalContext.current,
                        progress.receivedBytes,
                    ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
