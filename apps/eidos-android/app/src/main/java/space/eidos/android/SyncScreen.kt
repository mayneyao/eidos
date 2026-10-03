@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.repeatOnLifecycle

internal enum class SyncDestination {
    Overview,
    Account,
    Cloud,
    Download,
    Versions,
    Settings,
    Devices,
}

@Composable
internal fun SyncScreen(
    state: AppState,
    model: EidosModel,
    signIn: () -> Unit,
    manageAccount: () -> Unit,
    connect: () -> Unit,
    requestNotifications: () -> Unit,
) {
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(
        lifecycle,
        state.peerDevices.map { it.fingerprint },
        state.busy,
        state.peerBusy,
    ) {
        lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED) {
            while (true) {
                model.checkPeerAvailability()
                kotlinx.coroutines.delay(20_000)
            }
        }
    }
    var destination by
        rememberSaveable(state.spaceId) {
            mutableStateOf(
                if (state.peerProgress != null) SyncDestination.Devices
                else SyncDestination.Overview
            )
        }
    var cloudName by rememberSaveable { mutableStateOf("") }
    var cloudUrl by rememberSaveable { mutableStateOf("") }
    val connected = state.graft?.remoteUrl != null
    val ready = !state.busy && !state.syncing
    val scrollState = key(destination) { rememberScrollState() }
    LaunchedEffect(scrollState, state.peerProgress?.startedAt) {
        if (state.peerProgress != null && state.peerProgress.finishedAt == null)
            scrollState.animateScrollTo(0)
    }
    fun back() {
        destination =
            if (destination == SyncDestination.Download) SyncDestination.Cloud
            else SyncDestination.Overview
    }
    BackHandler(destination != SyncDestination.Overview) { if (ready) back() }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            windowInsets = WindowInsets(0, 0, 0, 0),
            title = {
                Text(
                    when (destination) {
                        SyncDestination.Overview -> "同步"
                        SyncDestination.Account -> "账号"
                        SyncDestination.Cloud -> "云端 Space"
                        SyncDestination.Download -> cloudName
                        SyncDestination.Versions -> "本地版本"
                        SyncDestination.Settings -> "同步设置"
                        SyncDestination.Devices -> "设备直连"
                    }
                )
            },
            navigationIcon = {
                if (destination != SyncDestination.Overview)
                    IconButton(onClick = ::back, enabled = ready) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回同步")
                    }
            },
            actions = {
                if (destination == SyncDestination.Overview)
                    IconButton(
                        onClick = { destination = SyncDestination.Account },
                        enabled = ready,
                    ) {
                        Icon(Icons.Outlined.AccountCircle, "账号与登录")
                    }
                if (destination == SyncDestination.Cloud && state.account != null)
                    IconButton(onClick = model::loadCloudSpaces, enabled = ready) {
                        Icon(Icons.Outlined.Refresh, "刷新云端 Space")
                    }
            },
        )
        Column(
            Modifier.weight(1f)
                .verticalScroll(scrollState)
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when (destination) {
                SyncDestination.Overview -> {
                    SyncOverview(
                        state = state,
                        model = model,
                        ready = ready,
                        connected = connected,
                        devices = { destination = SyncDestination.Devices },
                        cloud = {
                            destination = SyncDestination.Cloud
                            if (state.account != null) model.loadCloudSpaces()
                        },
                        versions = { destination = SyncDestination.Versions },
                        settings = { destination = SyncDestination.Settings },
                    )
                }
                SyncDestination.Account -> {
                    Icon(
                        Icons.Outlined.AccountCircle,
                        null,
                        Modifier.padding(top = 24.dp).size(48.dp),
                    )
                    Text(
                        state.account?.name ?: "登录以连接你的设备",
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Text("登录后可开启同步，或下载已有的云端 Space。未登录时，本地资料仍可使用。")
                    Text(
                        SyncEnvironment.label,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (state.account == null)
                        Button(onClick = signIn, enabled = ready) { Text("登录 Eidos 账号") }
                    else {
                        SyncNavigationRow(
                            "管理账号与同步权限",
                            "订阅与设备授权",
                            Icons.Outlined.ManageAccounts,
                            ready,
                            manageAccount,
                        )
                        TextButton(onClick = signIn, enabled = ready) { Text("重新登录") }
                        TextButton(onClick = model::signOut, enabled = ready) { Text("退出登录") }
                    }
                }
                SyncDestination.Cloud -> {
                    DownloadProgressView(state.downloadProgress)
                    Text(
                        "下载完整 Space，之后可离线查看和编辑。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (state.account == null)
                        Button(onClick = signIn, enabled = ready) { Text("登录 Eidos 账号") }
                    else {
                        if (!connected)
                            OutlinedButton(onClick = model::enableAccountSync, enabled = ready) {
                                Text("为当前 Space 开启云端同步")
                            }
                        val spaces = state.cloudSpaces
                        if (spaces == null)
                            Text(if (state.busy) "正在读取云端 Space…" else "尚未读取云端 Space，请点右上角刷新。")
                        else if (spaces.isEmpty()) Text("还没有云端 Space。开启同步后，可在其他设备登录并下载。")
                        else
                            spaces.forEach { cloud ->
                                SyncNavigationRow(
                                    cloud.name,
                                    if (cloud.url == state.graft?.remoteUrl) "当前 Space 的云端连接"
                                    else "查看下载详情",
                                    Icons.Outlined.Folder,
                                    ready,
                                ) {
                                    cloudName = cloud.name
                                    cloudUrl = cloud.url
                                    destination = SyncDestination.Download
                                }
                                HorizontalDivider()
                            }
                    }
                    state.pendingClone?.let { pending ->
                        Text(
                            "未完成的下载：${pending.space.name}",
                            style = MaterialTheme.typography.titleSmall,
                        )
                        Button(
                            onClick = { model.recoverClone(pending.space.id, false) },
                            enabled = ready,
                        ) {
                            Text(if (pending.ready) "完成导入" else "重新下载")
                        }
                        TextButton(
                            onClick = { model.recoverClone(pending.space.id, true) },
                            enabled = ready,
                        ) {
                            Text("删除未导入副本")
                        }
                    }
                }
                SyncDestination.Download -> {
                    DownloadProgressView(state.downloadProgress)
                    Icon(Icons.Outlined.Folder, null, Modifier.padding(top = 32.dp).size(48.dp))
                    Text(
                        cloudName,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text("云端 Space", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    HorizontalDivider()
                    Text("下载所有文件到新的本地 Space。现有 Space 的文件会保留，下载完成后自动打开。")
                    Text(
                        "下载期间请保持应用打开。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(
                        onClick = { model.downloadCloudSpace(CloudSpace(cloudName, cloudUrl)) },
                        enabled = ready && state.account != null && state.pendingClone == null,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (state.busy) "正在下载…" else "下载到本机")
                    }
                    if (state.pendingClone != null) Text("有未完成的下载，请返回云端 Space 处理后再继续。")
                }
                SyncDestination.Versions -> {
                    Text(
                        localVersionSummary(state.graft),
                        style = MaterialTheme.typography.headlineSmall,
                        modifier = Modifier.padding(top = 24.dp),
                    )
                    Text(
                        "本地版本包含数据文件、笔记和附件。保存版本不会上传文件。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(onClick = model::checkpoint, enabled = ready && state.graft != null) {
                        Text("保存本地版本")
                    }
                    TextButton(onClick = model::refreshGraft, enabled = ready) { Text("刷新状态") }
                    state.syncMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    HorizontalDivider()
                    Text("卸载应用会移除本地 Space，请先导出需要保留的文件。", style = MaterialTheme.typography.bodySmall)
                }
                SyncDestination.Devices -> PeerSyncScreen(state, model)
                SyncDestination.Settings -> {
                    if (connected) {
                        Text("云端同步", style = MaterialTheme.typography.titleMedium)
                        OutlinedButton(onClick = { model.syncRemote() }, enabled = ready) {
                            Text("同步云端")
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(
                                Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text("自动同步", style = MaterialTheme.typography.titleSmall)
                                Text(
                                    "系统允许时在后台与云端同步",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Switch(
                                state.automaticSync.enabled,
                                { enabled ->
                                    if (enabled) requestNotifications()
                                    model.setAutomaticSync(enabled)
                                },
                                enabled = ready,
                                modifier = Modifier.semantics { contentDescription = "自动同步开关" },
                            )
                        }
                        Text(
                            state.automaticSync.message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        HorizontalDivider()
                    }
                    Text("远程连接", style = MaterialTheme.typography.titleMedium)
                    Text(
                        state.graft?.remoteUrl ?: "尚未连接远程 Space",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    SyncNavigationRow(
                        "高级：手动连接 Graft 远程",
                        "自定义服务器与访问令牌",
                        Icons.Outlined.Link,
                        ready,
                        connect,
                    )
                    if (connected) {
                        if (
                            state.account != null &&
                                state.graft?.remoteUrl?.startsWith(SyncEnvironment.remote + "/") ==
                                    true
                        ) {
                            TextButton(onClick = model::useAccountForRemote, enabled = ready) {
                                Text("使用当前账号连接此 Space")
                            }
                        }
                        HorizontalDivider()
                        Text("首次发布", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "空远程首次使用时，先发布本机版本，再进行日常同步。",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        OutlinedButton(
                            onClick = { model.syncRemote(publish = true) },
                            enabled = ready,
                        ) {
                            Text("发布本机版本")
                        }
                        state.syncMessage?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall)
                        }
                        HorizontalDivider()
                        SyncNavigationRow(
                            "检查并合并",
                            "处理本机与云端的不同版本",
                            Icons.Outlined.Merge,
                            ready,
                            model::beginMerge,
                        )
                        SyncNavigationRow(
                            "加入后台同步",
                            "离开应用后，有网络时运行",
                            Icons.Outlined.Schedule,
                            ready && state.backgroundSync?.pending != true,
                        ) {
                            requestNotifications()
                            model.enqueueBackgroundSync()
                        }
                        state.backgroundSync?.let { work ->
                            Text(work.message, style = MaterialTheme.typography.bodySmall)
                            if (work.pending)
                                TextButton(onClick = model::cancelBackgroundSync) { Text("取消后台同步") }
                        }
                        HorizontalDivider()
                        TextButton(onClick = model::disconnectRemote, enabled = ready) {
                            Text("断开连接")
                        }
                        Text("仅移除本机连接，保留本地文件。", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

internal fun syncOverviewTitle(state: AppState): String =
    when {
        state.syncing -> "正在同步"
        state.graft == null -> "正在读取状态"
        state.graft.remoteUrl == null -> "仅保存在本机"
        state.mergeReview != null || state.graft.syncStatus == "needs_merge" -> "需要合并版本"
        state.backgroundSync?.state == "RUNNING" -> "正在后台同步"
        state.backgroundSync?.pending == true -> "等待后台同步"
        state.graft.syncStatus == "failed" -> "同步未完成"
        state.graft.syncStatus == "interrupted" -> "上次同步中断"
        state.graft.syncStatus == "completed" -> "上次同步已完成"
        else -> "有待同步的版本"
    }

internal fun localVersionSummary(graft: GraftState?): String =
    when {
        graft == null -> "正在读取版本状态"
        !graft.initialized -> "尚未创建版本"
        graft.dirty -> "有待保存的文件改动"
        else -> "本地版本已保存"
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
