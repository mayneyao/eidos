@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

private data class FilterDraft(
    val field: String,
    val op: String = "is-not-null",
    val text: String = "",
)

private val operatorNames =
    linkedMapOf(
        "is-not-null" to tr("不为空"),
        "is-null" to tr("为空"),
        "eq" to tr("等于"),
        "ne" to tr("不等于"),
        "contains" to tr("包含"),
        "starts-with" to tr("开头是"),
        "gt" to tr("大于"),
        "gte" to tr("大于等于"),
        "lt" to tr("小于"),
        "lte" to tr("小于等于"),
    )

@Composable
private fun FilterChoice(
    label: String,
    options: List<Pair<String, String>>,
    enabled: Boolean,
    choose: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled) { Text(label) }
        DropdownMenu(expanded, { expanded = false }) {
            options.forEach { (value, name) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = {
                        choose(value)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
internal fun FilterSheet(
    page: EidosPage,
    enabled: Boolean,
    dismiss: () -> Unit,
    apply: (List<EidosFilter>) -> Unit,
) {
    var drafts by remember {
        mutableStateOf(
            page.filters.map { FilterDraft(it.fieldId, it.op, it.value?.toString().orEmpty()) }
        )
    }
    var error by remember { mutableStateOf<String?>(null) }
    ModalBottomSheet(onDismissRequest = dismiss) {
        Column(
            Modifier.fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(tr("筛选"), style = MaterialTheme.typography.titleLarge)
            Text(
                if (page.view == null) tr("显示满足所有条件的记录") else tr("在已保存视图的基础上，追加以下条件"),
                style = MaterialTheme.typography.bodySmall,
            )
            drafts.forEachIndexed { index, draft ->
                val field = page.fields.find { it.id == draft.field }
                fun update(next: FilterDraft) {
                    drafts = drafts.toMutableList().also { it[index] = next }
                    error = null
                }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChoice(
                        field?.name ?: tr("字段已不存在"),
                        page.fields.map { it.id to it.name },
                        enabled,
                    ) {
                        update(FilterDraft(it))
                    }
                    val operators = buildList {
                        add("is-not-null")
                        add("is-null")
                        if (field?.sortable == true) {
                            add("eq")
                            add("ne")
                        }
                        if (field?.valueType in setOf("text", "url", "select", "row-id")) {
                            add("contains")
                            add("starts-with")
                        }
                        if (field?.sortable == true && field.valueType != "checkbox") {
                            add("gt")
                            add("gte")
                            add("lt")
                            add("lte")
                        }
                    }
                    FilterChoice(
                        operatorNames[draft.op].orEmpty(),
                        operators.map { it to operatorNames.getValue(it) },
                        enabled,
                    ) {
                        update(draft.copy(op = it))
                    }
                    if (draft.op !in setOf("is-null", "is-not-null")) {
                        if (field?.valueType == "checkbox")
                            FilterChoice(
                                if (draft.text == "true") tr("是") else tr("否"),
                                listOf("true" to tr("是"), "false" to tr("否")),
                                enabled,
                            ) {
                                update(draft.copy(text = it))
                            }
                        else
                            OutlinedTextField(
                                draft.text,
                                { update(draft.copy(text = it)) },
                                label = { Text(tr("比较值")) },
                                enabled = enabled,
                                modifier = Modifier.fillMaxWidth(),
                            )
                    }
                    TextButton(
                        onClick = {
                            drafts = drafts.filterIndexed { position, _ -> position != index }
                        },
                        enabled = enabled,
                    ) {
                        Text(tr("移除此条件"))
                    }
                    HorizontalDivider()
                }
            }
            TextButton(
                onClick = {
                    page.fields.firstOrNull()?.let { drafts = drafts + FilterDraft(it.id) }
                },
                enabled = enabled && page.fields.isNotEmpty(),
            ) {
                Text(tr("添加条件"))
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = {
                    val result = runCatching {
                        drafts.map { draft ->
                            val field =
                                checkNotNull(page.fields.find { it.id == draft.field }) {
                                    tr("请选择可用字段")
                                }
                            val value: Any? =
                                if (draft.op in setOf("is-null", "is-not-null")) null
                                else
                                    when (field.valueType) {
                                        "number" ->
                                            requireNotNull(
                                                draft.text.toDoubleOrNull()?.takeIf {
                                                    it.isFinite()
                                                }
                                            ) {
                                                tr("{0}：请输入有效数字", field.name)
                                            }
                                        "checkbox" -> draft.text == "true"
                                        else -> draft.text
                                    }
                            EidosFilter(field.id, draft.op, value)
                        }
                    }
                    result.onSuccess(apply).onFailure { error = it.message }
                },
                enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(tr("应用筛选"))
            }
            TextButton(onClick = { apply(emptyList()) }, enabled = enabled) { Text(tr("清除筛选")) }
        }
    }
}
