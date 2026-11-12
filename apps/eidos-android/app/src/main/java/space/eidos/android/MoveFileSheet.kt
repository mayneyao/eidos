@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException

@Composable
internal fun MoveFileSheet(file: SpaceFile, model: EidosModel, busy: Boolean, close: () -> Unit) {
    val owner = remember { model.repository }
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    LaunchedEffect(Unit) { keyboard?.hide() }
    var folder by remember { mutableStateOf(file.path.substringBeforeLast('/', "")) }
    var loadedFolder by remember { mutableStateOf<String?>(null) }
    var directories by remember { mutableStateOf(emptyList<SpaceFile>()) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    LaunchedEffect(folder, attempt) {
        error = null
        try {
            val entries = owner.files(folder).filter { it.directory }
            directories = entries
            loadedFolder = folder
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { error = failure.localizedMessage ?: tr("目录不存在") }
    }
    val ready = loadedFolder == folder && error == null
    ModalBottomSheet(
        onDismissRequest = { if (!busy) close() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        Column(Modifier.fillMaxHeight(0.85f).testTag("move-file-sheet")) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(tr("移动 {0}", file.name), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                IconButton(enabled = !busy, onClick = close) { Icon(Icons.Outlined.Close, tr("取消")) }
            }
            Text(tr("单独移动文件可能使相对链接和附件失效。移动整个文件夹可保留内部相对关系。"), Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall)
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                if (folder.isNotEmpty()) IconButton(enabled = !busy, onClick = { folder = folder.substringBeforeLast('/', "") }) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, tr("上一级目录"))
                }
                TextButton(enabled = !busy, onClick = { folder = "" }) { Text(tr("Space 根目录")) }
                Text(if (folder.isEmpty()) "/" else "/$folder", Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            HorizontalDivider()
            LoadingIndicator(!ready && error == null)
            LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
                if (ready) items(directories, key = { it.path }) { directory ->
                    val allowed = !file.directory || (directory.path != file.path && !directory.path.startsWith(file.path + "/"))
                    ListItem(
                        headlineContent = { Text(directory.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        leadingContent = { Icon(Icons.Outlined.Folder, null) },
                        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
                        modifier = Modifier.clickable(enabled = allowed && !busy) { folder = directory.path },
                    )
                }
            }
            error?.let { message ->
                Text(message, Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.error)
                TextButton(onClick = { attempt++ }) { Text(tr("重试")) }
            }
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.End) {
                TextButton(enabled = !busy, onClick = close) { Text(tr("取消")) }
                Button(
                    enabled = ready && !busy && folder != file.path.substringBeforeLast('/', ""),
                    onClick = { model.move(file, folder, owner, close) },
                ) { Text(tr("移动到此处")) }
            }
        }
    }
}
