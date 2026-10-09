@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.repeatOnLifecycle

internal enum class SyncDestination {
    Overview,
    Versions,
}

@Composable
internal fun SyncScreen(
    state: AppState,
    model: EidosModel,
) {
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle, state.peerDevices.map { it.fingerprint }, state.busy, state.peerBusy) {
        lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED) {
            while (true) {
                model.checkPeerAvailability()
                kotlinx.coroutines.delay(20_000)
            }
        }
    }
    var destination by rememberSaveable { mutableStateOf(SyncDestination.Overview) }
    val ready = !state.busy && !state.syncing && !state.peerBusy
    BackHandler(destination != SyncDestination.Overview) { destination = SyncDestination.Overview }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            windowInsets = WindowInsets(0, 0, 0, 0),
            title = { Text(if (destination == SyncDestination.Versions) tr("本地版本") else tr("同步")) },
            navigationIcon = {
                if (destination != SyncDestination.Overview)
                    IconButton(onClick = { destination = SyncDestination.Overview }) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, tr("返回同步"))
                    }
            },
        )
        Column(
            Modifier.weight(1f).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (destination == SyncDestination.Overview) {
                PeerSyncScreen(state, model) { id ->
                    destination = SyncDestination.Versions
                    model.showPeerVersions(id)
                }
            } else {
                LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(localVersionSummary(state.graft), style = MaterialTheme.typography.titleMedium)
                            Text(tr("保存数据文件、笔记和附件的本地版本，不会发送到电脑。"),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Button(onClick = model::checkpoint, enabled = ready && state.graft != null && (state.graft.dirty || !state.graft.initialized)) {
                                    Text(tr("保存本地版本"))
                                }
                                IconButton(onClick = model::refreshLocalVersions, enabled = ready) {
                                    Icon(Icons.Outlined.Refresh, tr("刷新状态"))
                                }
                            }
                            state.syncMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                        }
                        HorizontalDivider(Modifier.padding(vertical = 16.dp))
                        Text(tr("最近 50 个版本"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(bottom = 8.dp))
                    }
                    if (state.localVersions.isEmpty()) item { Text(tr("尚无本地版本"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    items(state.localVersions, key = { it.id }) { version ->
                        ListItem(
                            headlineContent = { Text(version.message, style = MaterialTheme.typography.bodyMedium) },
                            supportingContent = { Text(version.id.take(12), style = MaterialTheme.typography.bodySmall, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace) },
                            colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
                        )
                    }
                }
            }
        }
    }
}

internal fun syncOverviewTitle(state: AppState): String =
    when {
        state.syncing -> tr("正在同步")
        state.graft == null -> tr("正在读取状态")
        state.graft.remoteUrl == null -> tr("仅保存在本机")
        state.mergeReview != null || state.graft.syncStatus == "needs_merge" -> tr("需要合并版本")
        state.backgroundSync?.state == "RUNNING" -> tr("正在后台同步")
        state.backgroundSync?.pending == true -> tr("等待后台同步")
        state.graft.syncStatus == "failed" -> tr("同步未完成")
        state.graft.syncStatus == "interrupted" -> tr("上次同步中断")
        state.graft.syncStatus == "completed" -> tr("上次同步已完成")
        else -> tr("有待同步的版本")
    }

internal fun localVersionSummary(graft: GraftState?): String =
    when {
        graft == null -> tr("正在读取版本状态")
        !graft.initialized -> tr("尚未创建版本")
        graft.dirty -> tr("有待保存的文件改动")
        else -> tr("本地版本已保存")
    }

@Composable
internal fun SyncNavigationRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick)
            .heightIn(min = 64.dp)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
