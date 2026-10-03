package space.eidos.android

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject

// Native presentation of the shared UI's named option palette.
private val optionPalette =
    mapOf(
        "default" to (0xffcccccc to 0xff333333),
        "gray" to (0xffeeeeee to 0xff555555),
        "brown" to (0xffe6c9a8 to 0xff5b4d3d),
        "pink" to (0xffffd3e6 to 0xff9a3f5e),
        "red" to (0xffffadad to 0xffa63232),
        "orange" to (0xffffd6a5 to 0xffa65a20),
        "yellow" to (0xfffdffb6 to 0xff6e6620),
        "green" to (0xffcaffbf to 0xff23563b),
        "cyan" to (0xff9bf6ff to 0xff1c5858),
        "blue" to (0xffa0c4ff to 0xff3168a8),
        "purple" to (0xffbdb2ff to 0xff6e33b4),
    )

internal fun optionNames(value: Any?): List<String> =
    when (value) {
        is JSONArray -> (0 until value.length()).map { value.getString(it) }
        is String -> listOf(value)
        else -> emptyList()
    }

private fun catalog(field: EidosField): List<Pair<String, String>> {
    val options = field.settings.optJSONArray("options") ?: return emptyList()
    return (0 until options.length()).map { index ->
        val option = options.get(index)
        if (option is JSONObject) option.getString("name") to option.optString("color", "default")
        else option.toString() to "default"
    }
}

@Composable
internal fun OptionPill(field: EidosField, name: String) {
    val color = catalog(field).find { it.first == name }?.second ?: "default"
    val palette = optionPalette[color] ?: optionPalette.getValue("default")
    val dark = isSystemInDarkTheme()
    Surface(
        color = Color(if (dark) palette.second else palette.first),
        contentColor = if (dark) Color.White else Color(0xff18181b),
        shape = RoundedCornerShape(5.dp),
    ) {
        Text(
            name,
            Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun OptionValue(field: EidosField, value: Any?) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        optionNames(value).forEach { OptionPill(field, it) }
    }
}

@Composable
internal fun OptionInput(
    field: EidosField,
    value: Any,
    enabled: Boolean,
    compact: Boolean = false,
    update: (Any) -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    val selected = optionNames(value)
    val multiple = field.kind == "multi-select"
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!compact) Text(field.name, style = MaterialTheme.typography.labelLarge)
        if (!compact) OptionValue(field, value)
        Box {
            TextButton(
                onClick = { menu = true },
                enabled = enabled,
                contentPadding = PaddingValues(0.dp),
            ) {
                if (compact && selected.isNotEmpty()) OptionValue(field, value)
                else Text(if (multiple) "选择${field.name}（${selected.size}）" else "选择${field.name}")
                Text(" ▾")
            }
            DropdownMenu(menu, { menu = false }) {
                // Retain unknown existing values so users can remove them without losing others.
                val names = (catalog(field).map { it.first } + selected).distinct()
                if (names.isEmpty())
                    DropdownMenuItem(text = { Text("没有可选值") }, onClick = {}, enabled = false)
                names.forEach { name ->
                    DropdownMenuItem(
                        text = { OptionPill(field, name) },
                        leadingIcon =
                            if (multiple) ({ Checkbox(name in selected, onCheckedChange = null) })
                            else null,
                        enabled = enabled,
                        onClick = {
                            if (multiple)
                                update(
                                    JSONArray(
                                        if (name in selected) selected - name else selected + name
                                    )
                                )
                            else {
                                update(name)
                                menu = false
                            }
                        },
                    )
                }
                if (compact && field.nullable && value != JSONObject.NULL)
                    DropdownMenuItem(
                        text = { Text("清空${field.name}") },
                        onClick = {
                            update(JSONObject.NULL)
                            menu = false
                        },
                    )
                if (multiple) DropdownMenuItem(text = { Text("选择完成") }, onClick = { menu = false })
            }
        }
    }
}
