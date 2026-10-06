package space.eidos.android

import android.content.ClipData
import android.content.Intent
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

@Composable
internal fun AttachmentPreviewDialog(preview: AttachmentPreview, dismiss: () -> Unit) {
    val context = LocalContext.current
    var error by remember(preview.uri) { mutableStateOf<String?>(null) }
    Dialog(
        onDismissRequest = dismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(Modifier.fillMaxSize()) {
            Column(
                Modifier.safeDrawingPadding().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        preview.name,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    TextButton(onClick = dismiss) { Text(tr("关闭预览")) }
                }
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    if (preview.image != null)
                        Image(
                            preview.image.asImageBitmap(),
                            contentDescription = preview.name,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Fit,
                        )
                    else
                        Text(
                            if (preview.remote) tr("在线附件 · 点击后使用浏览器打开") else tr("使用已安装的应用查看此附件"),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                OutlinedButton(
                    onClick = {
                        try {
                            val intent =
                                Intent(Intent.ACTION_VIEW).apply {
                                    if (preview.remote) data = preview.uri
                                    else {
                                        setDataAndType(preview.uri, preview.mediaType)
                                        clipData = ClipData.newRawUri(preview.name, preview.uri)
                                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                    }
                                }
                            context.startActivity(Intent.createChooser(intent, tr("打开附件")))
                        } catch (_: android.content.ActivityNotFoundException) {
                            error = tr("没有可打开此附件的应用")
                        } catch (_: SecurityException) {
                            error = tr("无法向其他应用提供此附件")
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (preview.remote) tr("在浏览器中打开") else tr("打开方式"))
                }
            }
        }
    }
}
