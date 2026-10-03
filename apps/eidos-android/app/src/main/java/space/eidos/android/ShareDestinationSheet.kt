@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@Composable
internal fun ShareDestinationSheet(state: AppState, model: EidosModel) {
    val share = state.pendingShares.firstOrNull() ?: return
    state.shareDatabase?.let { database ->
        ModalBottomSheet(
            onDismissRequest = model::closeShareTable,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            Column(Modifier.fillMaxWidth().padding(24.dp)) {
                Text("选择目标表", style = MaterialTheme.typography.titleLarge)
                Text(database.path, style = MaterialTheme.typography.bodySmall)
                LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    items(database.tables, key = { it.id }) { table ->
                        ListItem(
                            headlineContent = { Text(table.name) },
                            leadingContent = { Icon(Icons.Outlined.TableChart, null) },
                            modifier =
                                Modifier.clickable(enabled = !state.busy) {
                                    model.openShareTable(database.path, table.id)
                                },
                        )
                    }
                    if (database.tables.isEmpty()) item { Text("此文件没有数据表") }
                }
                TextButton(onClick = model::closeShareTable, enabled = !state.busy) {
                    Text("返回选择位置")
                }
            }
        }
        return
    }
    ModalBottomSheet(
        onDismissRequest = model::cancelShare,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
            Text("保存分享内容", style = MaterialTheme.typography.titleLarge)
            Text(
                if (share.files.isEmpty()) "保存为 Markdown，或选择 Eidos 表格新增记录"
                else "${share.files.size} 个文件 · 可存入文件夹或表格附件字段",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp),
            )
            share.text?.let {
                Text(
                    it,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(vertical = 12.dp),
                )
            }
            share.form?.let { form ->
                TextButton(
                    enabled = !state.busy,
                    onClick = { model.openShareTable(form.path, form.table) },
                ) {
                    Text("继续填写分享记录")
                }
            }
            Text(
                state.spaceName,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(top = 16.dp),
            )
            Row(Modifier.fillMaxWidth()) {
                if (state.shareFolder.isNotEmpty())
                    IconButton(
                        onClick = {
                            model.browseShareFolder(state.shareFolder.substringBeforeLast('/', ""))
                        },
                        enabled = !state.busy,
                    ) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, "选择上级文件夹")
                    }
                Text(
                    state.shareFolder.ifEmpty { "Space 根目录" },
                    modifier = Modifier.weight(1f).padding(vertical = 14.dp),
                    style = MaterialTheme.typography.titleSmall,
                )
            }
            HorizontalDivider()
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 280.dp).testTag("share-folders")) {
                run {
                    val tables =
                        (listOfNotNull(state.lastShareTable) +
                                state.favorites.filter { it.tableId != null })
                            .distinctBy { it.key }
                    items(tables, key = { "table:${it.key}" }) { table ->
                        ListItem(
                            headlineContent = { Text(table.name) },
                            supportingContent = {
                                Text(
                                    if (table == state.lastShareTable) "上次保存的表格 · ${table.path}"
                                    else table.path
                                )
                            },
                            leadingContent = { Icon(Icons.Outlined.TableChart, null) },
                            modifier =
                                Modifier.clickable(enabled = !state.busy) {
                                    model.openShareTable(table.path, table.tableId)
                                },
                        )
                    }
                }
                items(state.shareFolders, key = { it.path }) { folder ->
                    ListItem(
                        headlineContent = { Text(folder.name) },
                        leadingContent = {
                            Icon(
                                if (folder.directory) Icons.Outlined.Folder
                                else Icons.Outlined.TableChart,
                                null,
                            )
                        },
                        modifier =
                            Modifier.clickable(enabled = !state.busy) {
                                if (folder.directory) model.browseShareFolder(folder.path)
                                else model.openShareTable(folder.path)
                            },
                    )
                }
                if (state.shareFolders.isEmpty())
                    item {
                        Text(
                            "没有子文件夹",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(vertical = 16.dp),
                        )
                    }
            }
            LoadingIndicator(state.busy)
            Button(
                onClick = model::saveShare,
                enabled = !state.busy,
                modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
            ) {
                Text("保存到此文件夹")
            }
        }
    }
}
