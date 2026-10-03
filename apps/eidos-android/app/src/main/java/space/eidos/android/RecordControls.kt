@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
internal fun RecordControls(
    page: EidosPage,
    visible: List<String>,
    enabled: Boolean,
    setVisible: (List<String>) -> Unit,
    filter: (List<EidosFilter>) -> Unit,
    sort: (EidosSort?) -> Unit,
) {
    var sheet by remember { mutableStateOf<String?>(null) }
    Row {
        listOf("筛选", "排序", "字段").forEach { name ->
            IconButton(onClick = { sheet = name }, enabled = enabled) {
                androidx.compose.material3.Icon(
                    when (name) {
                        "筛选" -> androidx.compose.material.icons.Icons.Outlined.FilterList
                        "排序" -> androidx.compose.material.icons.Icons.Outlined.Sort
                        else -> androidx.compose.material.icons.Icons.Outlined.ViewColumn
                    },
                    when (name) {
                        "筛选" -> "筛选（${page.filters.size}）"
                        "排序" ->
                            page.sort?.let {
                                "排序：${page.fields.find { f -> f.id == it.fieldId }?.name} ${if (it.descending) "降序" else "升序"}"
                            } ?: "排序"
                        else -> "字段（${visible.size}）"
                    },
                    tint =
                        if (
                            (name == "筛选" && page.filters.isNotEmpty()) ||
                                (name == "排序" && page.sort != null)
                        )
                            MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
    if (sheet == "筛选") {
        FilterSheet(page, enabled, { sheet = null }) {
            filter(it)
            sheet = null
        }
        return
    }
    if (sheet != null)
        ModalBottomSheet(onDismissRequest = { sheet = null }) {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp)) {
                Text(sheet.orEmpty(), style = MaterialTheme.typography.titleLarge)
                if (sheet == "排序") {
                    TextButton(
                        onClick = {
                            sort(null)
                            sheet = null
                        },
                        enabled = enabled,
                    ) {
                        Text(if (page.view == null) "默认顺序" else "恢复视图排序")
                    }
                    page.fields
                        .filter { it.sortable }
                        .forEach { field ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(field.name, Modifier.weight(1f))
                                TextButton(
                                    onClick = {
                                        sort(EidosSort(field.id))
                                        sheet = null
                                    },
                                    enabled = enabled,
                                ) {
                                    Text("升序")
                                }
                                TextButton(
                                    onClick = {
                                        sort(EidosSort(field.id, true))
                                        sheet = null
                                    },
                                    enabled = enabled,
                                ) {
                                    Text("降序")
                                }
                            }
                        }
                } else {
                    Text("选择记录列表中显示的字段。记录标题始终显示。", style = MaterialTheme.typography.bodySmall)
                    page.fields
                        .filter { it.id != page.table?.labelFieldId }
                        .forEach { field ->
                            val selected = field.id in visible
                            Row(
                                Modifier.fillMaxWidth().clickable(enabled = enabled) {
                                    setVisible(
                                        if (selected) visible - field.id else visible + field.id
                                    )
                                },
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(selected, onCheckedChange = null, enabled = enabled)
                                Text(field.name)
                            }
                        }
                    TextButton(onClick = { sheet = null }) { Text("完成") }
                }
            }
        }
}
