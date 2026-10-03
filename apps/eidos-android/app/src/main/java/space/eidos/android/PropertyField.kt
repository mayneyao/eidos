@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package space.eidos.android

import android.app.DatePickerDialog
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject

@Composable
internal fun PropertyField(
    field: EidosField,
    value: Any,
    enabled: Boolean,
    openAttachment: (JSONObject) -> Unit,
    relationLabels: Map<String, String>? = null,
    update: (Any) -> Unit,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var details by rememberSaveable(field.id) { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val editable = enabled && field.editable
    Column {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                field.name,
                Modifier.width(88.dp).padding(end = 12.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Box(Modifier.weight(1f)) {
                when {
                    field.kind == "file" ->
                        TextButton(
                            onClick = { details = true },
                            enabled = enabled,
                            contentPadding = PaddingValues(0.dp),
                        ) {
                            Icon(Icons.Outlined.AttachFile, "管理${field.name}", Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(
                                (value as? JSONArray)?.let {
                                    if (it.length() == 1) it.getJSONObject(0).optString("name")
                                    else "${it.length()} 个附件"
                                } ?: "没有附件"
                            )
                        }
                    field.kind == "relation" ->
                        Text(
                            relationDisplay(value, relationLabels),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    !field.editable ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.weight(1f)) {
                                if (field.kind in setOf("select", "multi-select"))
                                    OptionValue(field, value)
                                else Text(displayValue(value).ifEmpty { "—" })
                            }
                            Icon(Icons.Outlined.Lock, "只读字段", Modifier.size(16.dp))
                        }
                    field.isRating() ->
                        RatingInput(field, value, editable, compact = true, update = update)
                    field.kind in setOf("select", "multi-select") ->
                        OptionInput(field, value, editable, compact = true, update = update)
                    field.kind == "checkbox" ->
                        Checkbox(
                            value == true,
                            { update(it) },
                            enabled = editable,
                            modifier = Modifier.semantics { contentDescription = field.name },
                        )
                    field.kind == "date" ->
                        TextButton(
                            enabled = editable,
                            onClick = {
                                val date =
                                    runCatching { LocalDate.parse(displayValue(value)) }
                                        .getOrDefault(LocalDate.now())
                                DatePickerDialog(
                                        context,
                                        { _, year, month, day ->
                                            update(LocalDate.of(year, month + 1, day).toString())
                                        },
                                        date.year,
                                        date.monthValue - 1,
                                        date.dayOfMonth,
                                    )
                                    .show()
                            },
                            contentPadding = PaddingValues(0.dp),
                        ) {
                            Text(displayValue(value).ifEmpty { "选择日期" }, Modifier.weight(1f))
                            Icon(Icons.Outlined.CalendarToday, null, Modifier.size(20.dp))
                        }
                    else -> {
                        var text by
                            rememberSaveable(field.id) { mutableStateOf(displayValue(value)) }
                        LaunchedEffect(value) { if (value == JSONObject.NULL) text = "" }
                        val invalid =
                            field.kind == "number" &&
                                text.isNotEmpty() &&
                                text.toDoubleOrNull()?.isFinite() != true
                        Column {
                            BasicTextField(
                                value = text,
                                onValueChange = { next ->
                                    text = next
                                    update(
                                        if (field.kind == "number")
                                            next.toDoubleOrNull()?.takeIf { it.isFinite() } ?: next
                                        else next
                                    )
                                },
                                enabled = editable,
                                textStyle =
                                    MaterialTheme.typography.bodyLarge.copy(
                                        color = MaterialTheme.colorScheme.onSurface
                                    ),
                                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                                keyboardOptions =
                                    KeyboardOptions(
                                        keyboardType =
                                            if (field.kind in setOf("integer", "number"))
                                                KeyboardType.Decimal
                                            else KeyboardType.Text
                                    ),
                                modifier =
                                    Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics {
                                        contentDescription = field.name
                                    },
                                decorationBox = { inner ->
                                    Box(Modifier.padding(vertical = 12.dp)) {
                                        if (text.isEmpty())
                                            Text(
                                                "未填写",
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        inner()
                                    }
                                },
                            )
                            if (invalid)
                                Text(
                                    "请输入有效数值",
                                    color = MaterialTheme.colorScheme.error,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                        }
                    }
                }
            }
            if (
                field.nullable &&
                    field.editable &&
                    !field.isRating() &&
                    field.kind !in setOf("select", "multi-select")
            ) {
                Box {
                    IconButton(onClick = { menu = true }, enabled = editable) {
                        Icon(Icons.Outlined.MoreVert, "${field.name}操作", Modifier.size(18.dp))
                    }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem(
                            text = { Text("清空${field.name}") },
                            enabled = value != JSONObject.NULL,
                            onClick = {
                                update(JSONObject.NULL)
                                menu = false
                            },
                        )
                    }
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
    }
    if (details)
        ModalBottomSheet(onDismissRequest = { details = false }) {
            Column(
                Modifier.fillMaxWidth()
                    .verticalScroll(androidx.compose.foundation.rememberScrollState())
                    .padding(24.dp)
                    .padding(bottom = 24.dp)
            ) {
                FileFieldInput(
                    field,
                    value,
                    enabled && field.writable,
                    update,
                    openAttachment,
                    enabled,
                )
                TextButton(onClick = { details = false }) { Text("完成附件编辑") }
            }
        }
}
