package space.eidos.android

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject

@Composable
internal fun FileFieldInput(
    field: EidosField,
    value: Any,
    enabled: Boolean,
    update: (Any) -> Unit,
    open: (JSONObject) -> Unit,
    openEnabled: Boolean,
) {
    val entries = value as? JSONArray ?: JSONArray()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(field.name, style = MaterialTheme.typography.labelLarge)
        if (entries.length() == 0) Text("没有附件", style = MaterialTheme.typography.bodySmall)
        for (index in 0 until entries.length()) {
            val entry = entries.getJSONObject(index)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(entry.getString("name"), style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "${entry.getString("size")} 字节 · ${entry.getString("mediaType")}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                TextButton(onClick = { open(entry) }, enabled = openEnabled) { Text("打开") }
                if (enabled)
                    TextButton(
                        onClick = {
                            update(
                                JSONArray(
                                    (0 until entries.length())
                                        .filter { it != index }
                                        .map(entries::getJSONObject)
                                )
                            )
                        }
                    ) {
                        Text("移除")
                    }
            }
        }
    }
}
