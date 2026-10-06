package space.eidos.android

import org.json.JSONArray
import org.json.JSONObject

/** Presentation only. The Runtime owns relation resolution; values keep their original row IDs. */
internal fun parseRelationLabels(
    columns: JSONArray,
    row: JSONObject,
): Map<String, Map<String, String>> {
    val relations = row.optJSONArray("resolvedRelations") ?: return emptyMap()
    return (0 until relations.length()).associate { index ->
        val relation = relations.getJSONObject(index)
        val fieldId = columns.getJSONObject(relation.getInt("column")).getString("fieldId")
        val items = relation.getJSONArray("items")
        fieldId to
            (0 until items.length()).associate { itemIndex ->
                val item = items.getJSONObject(itemIndex)
                item.getString("id") to
                    if (item.optString("state") == "resolved")
                        relationLabel(item.opt("label")).ifBlank { tr("未命名记录") }
                    else tr("关联记录不可用")
            }
    }
}

private fun relationLabel(value: Any?): String =
    when (value) {
        null,
        JSONObject.NULL -> ""
        is JSONArray -> (0 until value.length()).joinToString("、") { relationLabel(value.opt(it)) }
        is JSONObject -> ""
        else -> value.toString()
    }
