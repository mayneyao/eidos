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
    var menu by remember { mutableStateOf(false) }
    var creating by remember { mutableStateOf(false) }
    var cloning by remember { mutableStateOf(false) }
    var recovering by remember { mutableStateOf(false) }
    var name by rememberSaveable { mutableStateOf("") }
    Box {
        TextButton(onClick = { menu = true }, enabled = !state.busy) {
            Text(
                state.spaceName,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Icon(Icons.Outlined.ExpandMore, "切换 Space")
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
            if (state.pendingShares.isNotEmpty())
                DropdownMenuItem(
                    text = { Text("待处理分享（${state.pendingShares.size}）") },
                    onClick = {
                        menu = false
                        model.showShareInbox(true)
                    },
                )
            DropdownMenuItem(
                text = { Text("云端 Space") },
                onClick = {
                    menu = false
                    model.tab(MainTab.Sync)
                },
            )
            DropdownMenuItem(
                text = { Text(if (state.pendingClone != null) "处理未完成的下载" else "高级：手动下载远程 Space") },
                onClick = {
                    menu = false
                    if (state.pendingClone != null) recovering = true else cloning = true
                },
            )
            DropdownMenuItem(
                text = { Text("新建 Space") },
                onClick = {
                    menu = false
                    creating = true
                },
            )
        }
    }
    val pending = state.pendingClone
    if (recovering && pending != null)
        AlertDialog(
            onDismissRequest = { if (!state.busy) recovering = false },
            title = { Text(pending.space.name) },
            text = {
                Column {
                    Text(
                        if (pending.ready) "文件已完整下载，可以离线完成导入。"
                        else "上次下载未完成。重新下载会替换这次未完成的副本，其他 Space 的文件会保留。"
                    )
                    DownloadProgressView(state.downloadProgress)
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !state.busy,
                    onClick = { model.recoverClone(pending.space.id, discard = false) },
                ) {
                    Text(if (pending.ready) "完成导入" else "重新下载")
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
                    Text("删除未导入副本")
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
                Text("新建本地 Space", style = MaterialTheme.typography.titleLarge)
                Text("每个 Space 分别保存文件、收藏和同步连接。", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    name,
                    { name = it },
                    label = { Text("Space 名称") },
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
                    Text("创建 Space")
                }
            }
        }
}
