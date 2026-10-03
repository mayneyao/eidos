@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
internal fun ViewControls(
    page: EidosPage,
    fields: List<String>,
    enabled: Boolean,
    model: EidosModel,
    modifier: Modifier = Modifier,
) {
    var menu by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var name by rememberSaveable(page.path, page.table?.id) { mutableStateOf("") }
    Row(modifier, horizontalArrangement = Arrangement.SpaceBetween) {
        Box(Modifier.weight(1f)) {
            TextButton(onClick = { menu = true }, enabled = enabled) {
                Text(
                    page.view?.name ?: "全部记录",
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
                Text(" ▾")
            }
            DropdownMenu(menu, { menu = false }) {
                DropdownMenuItem(
                    text = { Text("全部记录") },
                    onClick = {
                        menu = false
                        model.selectView(null)
                    },
                )
                DropdownMenuItem(
                    text = { Text("保存为视图") },
                    enabled = enabled && page.table != null,
                    onClick = {
                        menu = false
                        saving = true
                    },
                )
                page.views.forEach { view ->
                    DropdownMenuItem(
                        text = { Text(view.name + if (view.supported) "" else "（暂不支持）") },
                        enabled = view.supported,
                        onClick = {
                            menu = false
                            model.selectView(view.id)
                        },
                    )
                }
            }
        }
    }
    if (saving)
        ModalBottomSheet(onDismissRequest = { if (enabled) saving = false }) {
            Column(
                Modifier.fillMaxWidth().imePadding().padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text("保存为新视图", style = MaterialTheme.typography.titleLarge)
                Text("保存筛选、排序和字段显示到此数据文件。搜索关键词不会保存。", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    name,
                    { name = it },
                    label = { Text("视图名称") },
                    enabled = enabled,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        model.saveView(name, fields) {
                            saving = false
                            name = ""
                        }
                    },
                    enabled = enabled && name.isNotBlank(),
                ) {
                    Text("保存视图")
                }
            }
        }
}
