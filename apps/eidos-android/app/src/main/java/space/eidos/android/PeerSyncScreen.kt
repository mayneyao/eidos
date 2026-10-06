@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.material.icons.automirrored.outlined.ArrowBack

internal fun peerErrorMessage(error: String): String = when {
    error.contains("Space is closed", ignoreCase = true) -> tr("电脑已关闭此 Space。请重新打开并开启设备同步，再重试。")
    else -> error
}

@Composable
internal fun PeerInlineStatus(state: AppState, model: EidosModel, fingerprint: String, remoteId: String) {
    val progress = state.peerProgress?.takeIf { it.fingerprint == fingerprint && it.remoteId == remoteId } ?: return
    Column(Modifier.fillMaxWidth().padding(start = 36.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(progress.error?.let(::peerErrorMessage) ?: progress.stage, style = MaterialTheme.typography.bodySmall,
            color = if (progress.error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
        if (progress.finishedAt == null) {
            PeerTransferStatus(progress)
            TextButton(onClick = model::cancelPeerPairing) { Text(tr("停止同步")) }
        }
    }
}

internal fun peerScanOptions() = ScanOptions()
    .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
    .setPrompt(tr("扫描电脑上的 Eidos 配对二维码"))
    .setBeepEnabled(false)
    .setOrientationLocked(false)

@Composable
internal fun PeerSyncScreen(state: AppState, model: EidosModel, onVersions: (String) -> Unit = {}) {
    var code by rememberSaveable { mutableStateOf(model.peerPairingCode) }
    var addDevice by rememberSaveable { mutableStateOf(false) }
    var manualCode by rememberSaveable { mutableStateOf(model.peerPairingCode.isNotEmpty()) }
    var selectedDevice by rememberSaveable { mutableStateOf(model.peerSelectedDevice) }
    var choosingDevice by rememberSaveable { mutableStateOf(false) }
    var deviceMenu by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<PeerDevice?>(null) }
    val ready = !state.busy && !state.peerBusy
    val device = state.peerDevices.firstOrNull { it.fingerprint == selectedDevice } ?: state.peerDevices.firstOrNull()
    LaunchedEffect(state.peerDevices.map { it.fingerprint }) {
        if (device != null) selectedDevice = device.fingerprint
    }
    LaunchedEffect(state.peerMessage) {
        if (state.peerMessage == "设备已连接，请选择要同步的 Space") {
            selectedDevice = model.peerSelectedDevice ?: selectedDevice
            addDevice = false
        }
    }
    LaunchedEffect(selectedDevice) { model.peerSelectedDevice = selectedDevice }
    val scanner =
        rememberLauncherForActivityResult(ScanContract()) { result ->
            result.contents?.let {
                addDevice = true
                code = it
                model.peerPairingCode = it
                model.pairPeer(it)
            }
        }
    if (choosingDevice) {
        ModalBottomSheet(onDismissRequest = { choosingDevice = false }) {
            Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(tr("选择设备"), style = MaterialTheme.typography.titleLarge)
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                    state.peerDevices.forEach { peer ->
                        TextButton(onClick = { selectedDevice = peer.fingerprint; deviceMenu = false; choosingDevice = false }, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Outlined.Computer, null)
                            Column(Modifier.weight(1f).padding(horizontal = 12.dp), horizontalAlignment = Alignment.Start) {
                                Text(peer.name)
                                Text(peerAvailabilityLabel(state.peerAvailability[peer.fingerprint]), style = MaterialTheme.typography.bodySmall)
                            }
                            if (peer.fingerprint == device?.fingerprint) Icon(Icons.Outlined.Check, null)
                        }
                    }
                }
                HorizontalDivider()
                TextButton(onClick = { choosingDevice = false; model.beginPeerPairing(); addDevice = true; manualCode = false }) { Icon(Icons.Outlined.Add, null); Text(tr("连接新设备")) }
            }
        }
    }
    removing?.let { target ->
        AlertDialog(onDismissRequest = { removing = null },
            title = { Text(tr("解除与「{0}」的配对？", target.name)) },
            text = { Text(tr("此手机已下载的文件和版本历史会保留。再次同步需要重新配对。")) },
            confirmButton = { TextButton(onClick = { removing = null; model.forgetPeerDevice(target.fingerprint) }, enabled = ready) { Text(tr("解除配对"), color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text(tr("取消")) } })
    }
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (device != null) {
            val availability = state.peerAvailability[device.fingerprint]
            val locals = state.peerLocalSpaces.filter { it.fingerprint == device.fingerprint }
            val remotes = state.peerSpaces.filter { it.fingerprint == device.fingerprint }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { choosingDevice = true }, modifier = Modifier.weight(1f).heightIn(min = 56.dp).semantics { contentDescription = tr("选择设备") },
                    contentPadding = PaddingValues(vertical = 8.dp), enabled = ready) {
                    Icon(Icons.Outlined.Computer, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp), horizontalAlignment = Alignment.Start, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(device.name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        Text(peerAvailabilityLabel(availability), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Icon(Icons.Outlined.ExpandMore, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Box {
                    IconButton(onClick = { deviceMenu = true }, enabled = ready) { Icon(Icons.Outlined.MoreHoriz, tr("设备操作")) }
                    DropdownMenu(expanded = deviceMenu, onDismissRequest = { deviceMenu = false }) {
                        DropdownMenuItem(text = { Text(tr("刷新设备状态")) }, enabled = !state.peerChecking, onClick = { deviceMenu = false; model.refreshPeerAvailability() })
                        DropdownMenuItem(text = { Text(tr("解除配对"), color = MaterialTheme.colorScheme.error) }, onClick = { deviceMenu = false; removing = device })
                    }
                }
            }
            HorizontalDivider()
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(tr("这台电脑的 Spaces"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(vertical = 12.dp))
            locals.forEach { local ->
                Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Outlined.Folder, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(local.name, style = MaterialTheme.typography.titleSmall)
                        Text(local.lastSynced?.let { tr("已下载 · ") + java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT, java.text.DateFormat.SHORT).format(java.util.Date(it)) }
                            ?: tr("已下载 · 等待同步"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (availability?.reachable == true && local.remoteId !in availability.spaces)
                            Text(tr("电脑尚未开放此 Space"), style = MaterialTheme.typography.bodySmall)
                        if (local.unsupportedFiles.isNotEmpty())
                            Text(tr("{0} 已保留，需要电脑端支持的功能，暂无法在本机打开。", local.unsupportedFiles.joinToString("、")),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    OutlinedButton(onClick = { model.syncPeerSpace(local.id) }, enabled = ready && availability?.canSync(local.remoteId) == true) { Text(tr("同步")) }
                    var menu by remember(local.id) { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { menu = true }, enabled = ready) { Icon(Icons.Outlined.MoreHoriz, tr("{0} 操作", local.name)) }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(text = { Text(tr("打开文件")) }, onClick = { menu = false; model.openPeerFiles(local.id) })
                            DropdownMenuItem(text = { Text(tr("本地版本")) }, onClick = { menu = false; onVersions(local.id) })
                        }
                    }
                }
                PeerInlineStatus(state, model, device.fingerprint, local.remoteId)
                HorizontalDivider()
            }
            remotes.filter { remote -> locals.none { it.remoteId == remote.id } }.forEach { remote ->
                Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Outlined.Folder, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(remote.name, style = MaterialTheme.typography.titleSmall)
                        Text(tr("尚未下载到手机"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { model.connectPeerSpace(remote) }, enabled = ready && availability?.canSync(remote.id) == true) { Text(tr("下载")) }
                }
                PeerInlineStatus(state, model, device.fingerprint, remote.id)
                HorizontalDivider()
            }
            if (locals.isEmpty() && remotes.isEmpty()) Text(
                if (state.peerChecking) tr("正在读取 Spaces…") else if (availability?.reachable == true) tr("电脑尚未开放 Space") else tr("电脑离线，连接后可查看它的 Spaces。"),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(tr("已下载的 Space 可在「资料」中离线使用。"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        }
        }
        if (device == null && !addDevice) {
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            PeerDeviceRelationship(tr("你的电脑"))
            Text(tr("连接你的电脑"), style = MaterialTheme.typography.headlineSmall)
            Text(tr("无需账号。在同一 Wi-Fi 下连接，笔记与文件都留在你的设备上。"),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(tr("在电脑打开「设置 → 设备」，显示配对二维码。"), style = MaterialTheme.typography.bodySmall)
            Button(
                onClick = {
                    model.beginPeerPairing()
                    scanner.launch(
                        peerScanOptions()
                    )
                },
                enabled = ready,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                shape = MaterialTheme.shapes.medium,
            ) {
                Text(tr("扫描配对二维码"))
            }
            TextButton(onClick = { model.beginPeerPairing(); addDevice = true; manualCode = true }, enabled = ready) { Text(tr("使用配对码")) }
            if (state.peerProgress == null) {
                state.peerMessage?.let { Text(tr(it), style = MaterialTheme.typography.bodySmall) }
                state.error?.let { Text(peerErrorMessage(it), color = MaterialTheme.colorScheme.error) }
            }
            }
        }
        if (addDevice) {
            Dialog(onDismissRequest = { if (ready) addDevice = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
                TopAppBar(title = { Text(if (manualCode) tr("输入配对码") else tr("连接新设备")) }, windowInsets = WindowInsets(0, 0, 0, 0), navigationIcon = {
                    IconButton(onClick = { if (state.peerBusy) model.cancelPeerPairing(); addDevice = false }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, tr("返回同步")) }
                })
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(if (manualCode) tr("粘贴电脑显示的配对码，连接后在电脑上允许此设备。") else tr("在电脑打开「设置 → 设备」，扫描配对二维码。"), style = MaterialTheme.typography.bodyMedium)
                if (!manualCode) {
                    Button(onClick = { scanner.launch(peerScanOptions()) }, enabled = ready, modifier = Modifier.fillMaxWidth()) { Text(tr("扫描配对二维码")) }
                    TextButton(onClick = { manualCode = true }) { Text(tr("使用配对码")) }
                }
            if (manualCode) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it; model.peerPairingCode = it },
                    label = { Text(tr("配对码")) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = ready,
                    maxLines = 3,
                )
                Button(onClick = { model.pairPeer(code) }, enabled = code.isNotBlank() && ready, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium) {
                    Text(tr("连接电脑"))
                }
            }
            if (state.peerBusy) TextButton(onClick = model::cancelPeerPairing) { Text(tr("取消配对")) }
            if (state.peerProgress == null) {
            state.peerWaitingComputer?.let {
                Text(tr("等待电脑授权"), style = MaterialTheme.typography.titleLarge)
                Text(it, style = MaterialTheme.typography.titleMedium)
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            state.peerMessage?.let { Text(tr(it), style = MaterialTheme.typography.bodyMedium) }
            state.error?.let { Text(peerErrorMessage(it), color = MaterialTheme.colorScheme.error) }
            }
            }
            }
            }
            }
        }
    }
}

@Composable
private fun PeerDeviceRelationship(computer: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 24.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
        PeerDeviceEndpoint(computer, Icons.Outlined.Computer, Modifier.weight(1f))
        Icon(Icons.Outlined.SyncAlt, null, Modifier.padding(horizontal = 16.dp).size(20.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant)
        PeerDeviceEndpoint(tr("这台手机"), Icons.Outlined.Smartphone, Modifier.weight(1f))
    }
}

@Composable
private fun PeerDeviceEndpoint(name: String, icon: ImageVector, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, null, Modifier.size(32.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(name, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
    }
}

@Composable
private fun PeerPairingStep(number: String, title: String, detail: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(number, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 3.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
