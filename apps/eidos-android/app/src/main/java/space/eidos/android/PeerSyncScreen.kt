package space.eidos.android

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

@Composable
internal fun PeerSyncScreen(state: AppState, model: EidosModel) {
    var code by rememberSaveable { mutableStateOf("") }
    var addDevice by rememberSaveable { mutableStateOf(false) }
    var manualCode by rememberSaveable { mutableStateOf(false) }
    val ready = !state.busy && !state.peerBusy
    val scanner =
        rememberLauncherForActivityResult(ScanContract()) { result ->
            result.contents?.let {
                code = it
                model.pairPeer(it)
            }
        }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (state.peerDevices.isNotEmpty())
            TextButton(
                onClick = model::refreshPeerAvailability,
                enabled = ready && !state.peerChecking,
            ) {
                Text(if (state.peerChecking) "正在检测设备…" else "刷新设备状态")
            }
        state.peerProgress?.let { PeerSyncProgressView(it) }
        Text("电脑与手机之间同步文件", style = MaterialTheme.typography.titleLarge)
        Text(
            "下载一次，以后点「同步」即可交换手机和电脑的修改。请让两端连接同一 Wi-Fi，并保持电脑开启。",
            style = MaterialTheme.typography.bodyMedium,
        )
        if (state.peerLocalSpaces.isNotEmpty()) {
            Text("我的同步 Space", style = MaterialTheme.typography.titleMedium)
            state.peerLocalSpaces.forEach { local ->
                val computer = state.peerDevices.firstOrNull { it.fingerprint == local.fingerprint }
                val availability = state.peerAvailability[local.fingerprint]
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(local.name, style = MaterialTheme.typography.titleSmall)
                    Text(
                        computer?.let { "局域网 ↔ ${it.name}" } ?: "电脑已移除",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (computer != null)
                        Text(
                            peerAvailabilityLabel(availability, local.remoteId),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    if (local.id == state.spaceId && state.graft?.dirty == true && computer != null)
                        Text(
                            "有本地修改，等待发送到 ${computer.name}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    Text(
                        local.lastSynced?.let {
                            "上次同步：${java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT, java.text.DateFormat.SHORT).format(java.util.Date(it))}"
                        } ?: "待同步确认 · 已保留本地副本",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(
                            onClick = { model.syncPeerSpace(local.id) },
                            enabled =
                                ready &&
                                    computer != null &&
                                    availability?.canSync(local.remoteId) == true,
                        ) {
                            Text(if (local.lastSynced == null) "继续同步" else "同步")
                        }
                        TextButton(onClick = { model.openPeerFiles(local.id) }, enabled = ready) {
                            Text("打开文件")
                        }
                    }
                }
                HorizontalDivider()
            }
        }
        if (state.peerDevices.isNotEmpty()) {
            Text("从电脑添加 Space", style = MaterialTheme.typography.titleMedium)
            state.peerDevices.forEach { device ->
                val availability = state.peerAvailability[device.fingerprint]
                Text(
                    peerAvailabilityLabel(availability),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    OutlinedButton(
                        onClick = { model.browsePeerSpaces(device.fingerprint) },
                        enabled = ready && availability?.fresh() == true && availability.reachable,
                    ) {
                        Text("${device.name} · 选择 Space")
                    }
                    var managing by remember(device.fingerprint) { mutableStateOf(false) }
                    Box {
                        TextButton(onClick = { managing = true }, enabled = ready) { Text("管理") }
                        DropdownMenu(expanded = managing, onDismissRequest = { managing = false }) {
                            DropdownMenuItem(
                                text = { Text("移除电脑连接") },
                                onClick = {
                                    managing = false
                                    model.forgetPeerDevice(device.fingerprint)
                                },
                            )
                        }
                    }
                }
                state.peerSpaces
                    .filter { space ->
                        space.fingerprint == device.fingerprint &&
                            state.peerLocalSpaces.none {
                                it.fingerprint == space.fingerprint && it.remoteId == space.id
                            }
                    }
                    .forEach { space ->
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                        ) {
                            Text(
                                space.name,
                                modifier = Modifier.weight(1f),
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            TextButton(
                                onClick = { model.connectPeerSpace(space) },
                                enabled = ready && availability?.canSync(space.id) == true,
                            ) {
                                Text("下载到手机")
                            }
                        }
                    }
            }
            TextButton(onClick = { addDevice = !addDevice }, enabled = ready) { Text("添加另一台电脑") }
        }
        if (state.peerDevices.isEmpty() || addDevice) {
            Text("添加电脑", style = MaterialTheme.typography.titleMedium)
            Text("电脑打开要同步的 Space，在「同步 → 设备直连」开启设备同步。手机扫码后，在电脑上允许连接。")
            OutlinedButton(
                onClick = {
                    scanner.launch(
                        ScanOptions()
                            .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            .setPrompt("扫描电脑上的 Eidos 配对二维码")
                            .setBeepEnabled(false)
                    )
                },
                enabled = ready,
            ) {
                Text("扫描配对二维码")
            }
            TextButton(onClick = { manualCode = !manualCode }, enabled = ready) { Text("使用配对码") }
            if (manualCode) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it },
                    label = { Text("配对码") },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = ready,
                    maxLines = 3,
                )
                Button(onClick = { model.pairPeer(code) }, enabled = code.isNotBlank() && ready) {
                    Text("连接电脑")
                }
            }
            if (state.peerBusy) TextButton(onClick = model::cancelPeerPairing) { Text("取消连接") }
        }
        if (state.peerProgress == null)
            state.peerMessage?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        if (state.peerProgress?.error == null)
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}
