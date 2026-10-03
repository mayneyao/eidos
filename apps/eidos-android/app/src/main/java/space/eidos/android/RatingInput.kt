package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import org.json.JSONObject

internal fun EidosField.isRating(): Boolean =
    kind == "integer" && settings.optJSONObject("display")?.optString("kind") == "rating"

/** Display assistance only: preserve the full Integer domain and never clamp stored values. */
@Composable
internal fun RatingInput(
    field: EidosField,
    value: Any,
    enabled: Boolean,
    compact: Boolean = false,
    update: (Any) -> Unit,
) {
    val display = field.settings.optJSONObject("display") ?: JSONObject()
    val minimum = if (display.has("min")) display.opt("min")?.toString()?.toIntOrNull() else 0
    val maximum = if (display.has("max")) display.opt("max")?.toString()?.toIntOrNull() else 5
    val range =
        if (
            minimum != null &&
                maximum != null &&
                minimum in 0..10 &&
                maximum in 1..10 &&
                minimum <= maximum
        )
            minimum..maximum
        else null
    val text = if (value == JSONObject.NULL) "" else value.toString()
    val integer = text.toLongOrNull()
    val outside =
        text.isNotEmpty() &&
            (integer == null || range == null || integer < range.first || integer > range.last)
    var manual by rememberSaveable(field.id) { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (!compact) Text(field.name, style = MaterialTheme.typography.labelLarge)
        if (!compact || outside || value == JSONObject.NULL)
            Text(
                if (text.isEmpty()) "未评分" else "$text 分",
                style = MaterialTheme.typography.bodyMedium,
            )
        if (range != null) {
            FlowRow {
                if (range.first == 0 && !compact)
                    TextButton(
                        onClick = { update("0") },
                        enabled = enabled,
                        modifier =
                            Modifier.semantics {
                                contentDescription = "${field.name}：0 分"
                                selected = integer == 0L
                            },
                    ) {
                        Text("0")
                    }
                for (score in maxOf(1, range.first)..range.last) {
                    IconButton(
                        onClick = { update(score.toString()) },
                        enabled = enabled,
                        modifier =
                            Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).semantics {
                                contentDescription = "${field.name}：$score 分"
                                selected = integer == score.toLong()
                            },
                    ) {
                        Icon(
                            if (integer != null && integer >= score) Icons.Outlined.Star
                            else Icons.Outlined.StarBorder,
                            null,
                        )
                    }
                }
                if (compact)
                    Box {
                        IconButton(onClick = { menu = true }, enabled = enabled) {
                            Icon(Icons.Outlined.MoreVert, "${field.name}操作")
                        }
                        DropdownMenu(menu, { menu = false }) {
                            DropdownMenuItem(
                                text = { Text("输入数值") },
                                onClick = {
                                    manual = true
                                    menu = false
                                },
                            )
                            if (range?.first == 0)
                                DropdownMenuItem(
                                    text = { Text("设为 0 分") },
                                    onClick = {
                                        update("0")
                                        menu = false
                                    },
                                )
                            if (field.nullable)
                                DropdownMenuItem(
                                    text = { Text("清空评分") },
                                    onClick = {
                                        update(JSONObject.NULL)
                                        menu = false
                                    },
                                )
                        }
                    }
            }
        }
        if (manual || outside || range == null) {
            OutlinedTextField(
                value = text,
                onValueChange = {
                    update(if (it.isEmpty() && field.nullable) JSONObject.NULL else it)
                },
                enabled = enabled,
                label = { Text("${field.name}数值") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        } else if (!compact)
            TextButton(onClick = { manual = true }, enabled = enabled) { Text("输入数值") }
        if (!compact && field.nullable && value != JSONObject.NULL)
            TextButton(onClick = { update(JSONObject.NULL) }, enabled = enabled) { Text("清空评分") }
    }
}
