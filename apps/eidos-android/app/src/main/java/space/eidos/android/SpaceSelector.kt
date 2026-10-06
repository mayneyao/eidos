@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@Composable
internal fun SpaceSelector(state: AppState, model: EidosModel) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var deleting by remember { mutableStateOf(false) }
    var deletionId by rememberSaveable { mutableStateOf<String?>(null) }
    val unlock = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { result ->
        val id = deletionId
        deletionId = null
        if (result.resultCode == android.app.Activity.RESULT_OK && id != null) model.deleteLocalSpaceAfterUnlock(id)
    }
    var menu by remember { mutableStateOf(false) }
    var creating by remember { mutableStateOf(false) }
    var cloning by remember { mutableStateOf(false) }
    var recovering by remember { mutableStateOf(false) }
    var name by rememberSaveable { mutableStateOf("") }
    Box {
        TextButton(onClick = { menu = true }, enabled = !state.busy && !state.peerBusy && deletionId == null) {
            Text(
                state.spaceName,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Icon(Icons.Outlined.ExpandMore, tr("切换 Space"))
        }
        DropdownMenu(menu, { menu = false }) {
            state.spaces.forEach { space ->
                DropdownMenuItem(
                    text = { Text(space.name) },
                    onClick = {
                        menu = false
                        model.switchSpace(space.id)
                    },
                )
            }
            HorizontalDivider()
            DropdownMenuItem(text = { Text(tr("删除此 Space 的本地数据"), color = MaterialTheme.colorScheme.error) }, onClick = { menu = false; deleting = true })
            if (state.pendingShares.isNotEmpty())
                DropdownMenuItem(
                    text = { Text(tr("待处理分享（{0}）", state.pendingShares.size)) },
                    onClick = {
                        menu = false
                        model.showShareInbox(true)
                    },
                )
            DropdownMenuItem(
                text = { Text(tr("新建 Space")) },
                onClick = {
                    menu = false
                    creating = true
                },
            )
        }
    }
    if (deleting) AlertDialog(
        onDismissRequest = { deleting = false },
        title = { Text(tr("删除「{0}」？", state.spaceName)) },
        text = { Text(tr("将永久删除此手机上的文件、版本历史和草稿，无法撤销。电脑上的副本和设备配对会保留。下一步需要通过手机系统解锁验证。")) },
        dismissButton = { TextButton(onClick = { deleting = false }) { Text(tr("取消")) } },
        confirmButton = { TextButton(onClick = {
            deleting = false
            val keyguard = context.getSystemService(android.app.KeyguardManager::class.java)
            @Suppress("DEPRECATION")
            val intent = if (keyguard.isDeviceSecure) keyguard.createConfirmDeviceCredentialIntent(tr("删除本地 Space"), tr("验证身份以删除「{0}」", state.spaceName)) else null
            if (intent == null) model.linkError(tr("请先在手机系统设置中设置锁屏密码，再删除 Space"))
            else { deletionId = state.spaceId; unlock.launch(intent) }
        }) { Text(tr("验证身份并删除"), color = MaterialTheme.colorScheme.error) } },
    )
    val pending = state.pendingClone
    if (recovering && pending != null)
        AlertDialog(
            onDismissRequest = { if (!state.busy) recovering = false },
            title = { Text(pending.space.name) },
            text = {
                Column {
                    Text(
                        if (pending.ready) tr("文件已完整下载，可以离线完成导入。")
                        else tr("上次下载未完成。重新下载会替换这次未完成的副本，其他 Space 的文件会保留。")
                    )
                    DownloadProgressView(state.downloadProgress)
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !state.busy,
                    onClick = { model.recoverClone(pending.space.id, discard = false) },
                ) {
                    Text(if (pending.ready) tr("完成导入") else tr("重新下载"))
                }
            },
            dismissButton = {
                TextButton(
                    enabled = !state.busy,
                    onClick = {
                        recovering = false
                        model.recoverClone(pending.space.id, discard = true)
                    },
                ) {
                    Text(tr("删除未导入副本"))
                }
            },
        )
    if (cloning)
        CloneSpaceSheet(state.busy, state.downloadProgress, { cloning = false }) { name, url, token
            ->
            model.cloneSpace(name, url, token) { cloning = false }
        }
    if (creating)
        ModalBottomSheet(onDismissRequest = { if (!state.busy) creating = false }) {
            Column(
                Modifier.fillMaxWidth().imePadding().padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(tr("新建本地 Space"), style = MaterialTheme.typography.titleLarge)
                Text(tr("每个 Space 分别保存文件、收藏和同步连接。"), style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    name,
                    { name = it },
                    label = { Text(tr("Space 名称")) },
                    singleLine = true,
                    enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        model.createSpace(name) {
                            creating = false
                            name = ""
                        }
                    },
                    enabled = !state.busy && name.isNotBlank(),
                ) {
                    Text(tr("创建 Space"))
                }
            }
        }
}
