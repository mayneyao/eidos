package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

@Composable
fun MergeReviewDialog(state: AppState, model: EidosModel) {
    val review = state.mergeReview ?: return
    var choice by remember(review.token) { mutableStateOf<Pair<MergeFile, String>?>(null) }
    var abort by remember { mutableStateOf(false) }
    Dialog(
        onDismissRequest = {},
        properties =
            DialogProperties(
                dismissOnBackPress = false,
                dismissOnClickOutside = false,
                usePlatformDefaultWidth = false,
            ),
    ) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.safeDrawingPadding().padding(horizontal = 20.dp, vertical = 12.dp)) {
                Text("合并版本", style = MaterialTheme.typography.headlineMedium)
                Text(
                    if (review.unresolved == 0) "所有文件已处理，可以保存合并"
                    else "${review.unresolved} 个文件需要选择版本",
                    Modifier.padding(vertical = 12.dp),
                )
                Text("合并进度已保存在本机。完成或中止合并后可继续编辑文件。", style = MaterialTheme.typography.bodySmall)
                LoadingIndicator(state.busy, Modifier.padding(top = 8.dp))
                LazyColumn(
                    Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(vertical = 20.dp),
                ) {
                    items(review.files, key = { it.path }) { file ->
                        Column {
                            Text(file.path, style = MaterialTheme.typography.titleSmall)
                            Text(
                                if (file.resolved) "已处理" else "等待选择",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            if (!file.resolved) {
                                if (file.path.endsWith(".eidos", true))
                                    Text(
                                        "选择整个数据文件会采用该版本的所有表和记录。",
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                if (
                                    file.path.endsWith(".md", true) ||
                                        file.path.endsWith(".txt", true)
                                ) {
                                    TextButton(
                                        onClick = { model.compareMerge(file.path) },
                                        enabled = !state.busy,
                                    ) {
                                        Text("查看两个版本")
                                    }
                                    state.mergeComparison
                                        ?.takeIf { it.path == file.path }
                                        ?.let { comparison ->
                                            Text("本机", style = MaterialTheme.typography.labelLarge)
                                            SelectionContainer {
                                                Text(
                                                    comparison.ours,
                                                    style = MaterialTheme.typography.bodySmall,
                                                )
                                            }
                                            Text(
                                                "远端",
                                                style = MaterialTheme.typography.labelLarge,
                                                modifier = Modifier.padding(top = 12.dp),
                                            )
                                            SelectionContainer {
                                                Text(
                                                    comparison.theirs,
                                                    style = MaterialTheme.typography.bodySmall,
                                                )
                                            }
                                        }
                                }
                                Row {
                                    TextButton(
                                        onClick = { choice = file to "ours" },
                                        enabled = !state.busy,
                                    ) {
                                        Text(if (file.hasOurs) "保留本机文件" else "采用本机删除")
                                    }
                                    TextButton(
                                        onClick = { choice = file to "theirs" },
                                        enabled = !state.busy,
                                    ) {
                                        Text(if (file.hasTheirs) "使用远端文件" else "采用远端删除")
                                    }
                                }
                            }
                            HorizontalDivider()
                        }
                    }
                }
                Button(
                    onClick = { model.finishMerge(false) },
                    enabled = !state.busy && review.unresolved == 0,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("保存合并")
                }
                TextButton(
                    onClick = { abort = true },
                    enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("中止合并")
                }
            }
        }
        choice?.let { (file, side) ->
            AlertDialog(
                onDismissRequest = { choice = null },
                title = { Text("选择整个文件版本") },
                text = {
                    Text(
                        "${file.path}\n将采用${if (side == "ours") "本机" else "远端"}的整个文件状态，另一端对此文件的改动不会进入合并结果。历史版本仍保留。"
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            choice = null
                            model.chooseMerge(file.path, side)
                        }
                    ) {
                        Text("确认选择")
                    }
                },
                dismissButton = { TextButton(onClick = { choice = null }) { Text("返回") } },
            )
        }
        if (abort)
            AlertDialog(
                onDismissRequest = { abort = false },
                title = { Text("中止这次合并？") },
                text = { Text("恢复开始合并前的本机版本，放弃本次合并选择。远端版本仍保留。") },
                confirmButton = {
                    TextButton(
                        onClick = {
                            abort = false
                            model.finishMerge(true)
                        }
                    ) {
                        Text("确认中止")
                    }
                },
                dismissButton = { TextButton(onClick = { abort = false }) { Text("继续处理") } },
            )
    }
}
