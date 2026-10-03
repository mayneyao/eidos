package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@Composable
internal fun SyncOverview(
    state: AppState,
    model: EidosModel,
    ready: Boolean,
    connected: Boolean,
    devices: () -> Unit,
    cloud: () -> Unit,
    versions: () -> Unit,
    settings: () -> Unit,
) {
    val locale = androidx.compose.ui.platform.LocalConfiguration.current.locales[0]
    val peer = state.peerLocalSpaces.firstOrNull { it.id == state.spaceId }
    val computer = state.peerDevices.firstOrNull { it.fingerprint == peer?.fingerprint }
    val direct = computer != null
    val availability = computer?.let { state.peerAvailability[it.fingerprint] }
    val canSyncPeer = peer?.let { availability?.canSync(it.remoteId) } == true
    val progress = state.peerProgress
    val attention =
        if (direct) progress?.error != null
        else state.graft?.syncStatus in setOf("failed", "interrupted", "needs_merge")
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            "当前 Space",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Folder, null, Modifier.size(20.dp))
            SpaceSelector(state, model)
        }
    }
    Column(
        Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            if (direct) "同步此 Space" else syncOverviewTitle(state),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (direct) Icons.Outlined.Computer
                else if (connected) Icons.Outlined.Cloud else Icons.Outlined.PhoneAndroid,
                null,
                Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                if (direct) "本次通过设备直连交换修改" else if (connected) "通过云端交换修改" else "文件可离线查看和编辑",
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (progress == null) {
            Text(
                when {
                    direct && state.graft?.dirty == true -> "有本地修改，等待同步"
                    direct && peer?.lastSynced != null ->
                        "上次同步 · ${java.text.SimpleDateFormat("MM-dd HH:mm", locale).format(java.util.Date(peer.lastSynced))}"
                    direct -> "连接同一 Wi-Fi，并保持电脑上的 Space 打开"
                    connected -> "将本机修改上传，并接收云端更新"
                    else -> "连接电脑，或从下方选择云端 Space"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Button(
            onClick = {
                when {
                    direct -> model.syncPeerSpace(state.spaceId)
                    !connected -> devices()
                    state.graft?.syncStatus == "needs_merge" -> model.beginMerge()
                    else -> model.syncRemote()
                }
            },
            enabled = ready && (!direct || canSyncPeer),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) {
            Icon(
                if (!direct && !connected) Icons.Outlined.Add else Icons.Outlined.Sync,
                null,
                Modifier.size(18.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                when {
                    direct -> "同步"
                    !connected -> "连接电脑"
                    state.graft?.syncStatus == "needs_merge" -> "检查并合并"
                    attention -> "重试同步"
                    else -> "立即同步"
                }
            )
        }
        progress?.let { PeerSyncProgressView(it) }
        if (direct) {
            Text(
                peerAvailabilityLabel(availability, peer?.remoteId),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (!canSyncPeer)
                TextButton(
                    onClick = model::refreshPeerAvailability,
                    enabled = ready && !state.peerChecking,
                ) {
                    Text(if (state.peerChecking) "正在检测…" else "重新检测连接")
                }
        }
        if (!direct)
            state.syncMessage?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color =
                        if (attention) MaterialTheme.colorScheme.error
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
    }
    HorizontalDivider()
    SyncSectionLabel("此 Space 的连接")
    Column {
        SyncNavigationRow(
            "设备直连",
            if (direct) "当前目标 · ${computer!!.name.removeSuffix(".local")}" else "连接电脑，无需登录",
            Icons.Outlined.Devices,
            ready,
            devices,
        )
        SyncNavigationRow(
            "云端 Space",
            when {
                connected -> "已连接 · 浏览云端 Space"
                state.account != null -> "开启同步或下载已有 Space"
                else -> "登录后开启同步或下载 Space"
            },
            Icons.Outlined.Cloud,
            ready,
            cloud,
        )
    }
    HorizontalDivider()
    SyncSectionLabel("本地与设置")
    Column {
        SyncNavigationRow(
            "本地版本",
            localVersionSummary(state.graft),
            Icons.Outlined.History,
            ready,
            versions,
        )
        SyncNavigationRow("同步设置", "自动同步与高级连接", Icons.Outlined.Settings, ready, settings)
    }
}

@Composable
private fun SyncSectionLabel(text: String) {
    Text(
        text,
        Modifier.padding(top = 4.dp),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
