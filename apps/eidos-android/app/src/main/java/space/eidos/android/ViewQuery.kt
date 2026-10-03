package space.eidos.android

import org.json.JSONArray
import org.json.JSONObject

/** Compose public query documents; Runtime owns their validation and evaluation. */
internal fun effectiveViewQuery(
    view: EidosView?,
    filters: List<EidosFilter>,
    sort: EidosSort?,
): JSONObject {
    val query = JSONObject(view?.query ?: "{}")
    if (filters.isNotEmpty()) {
        val args = JSONArray()
        query.optJSONObject("filter")?.let { args.put(it) }
        filters.forEach { args.put(it.json()) }
        query.put("filter", JSONObject().put("op", "and").put("args", args))
    }
    if (sort != null)
        query.put(
            "sort",
            JSONArray()
                .put(
                    JSONObject()
                        .put("fieldId", sort.fieldId)
                        .put("direction", if (sort.descending) "desc" else "asc")
                ),
        )
    return query
}

internal fun viewFields(page: EidosPage): List<String>? {
    val layout = page.view?.let { JSONObject(it.layout) } ?: return null
    val hidden = layout.optJSONArray("hiddenFields") ?: JSONArray()
    val order = layout.optJSONArray("fieldOrder") ?: JSONArray()
    val hiddenIds = (0 until hidden.length()).mapNotNull { hidden.opt(it) as? String }.toSet()
    val ordered = (0 until order.length()).mapNotNull { order.opt(it) as? String }
    return (ordered + page.fields.map { it.id }).distinct().filter { id ->
        id !in hiddenIds && id != page.table?.labelFieldId && page.fields.any { it.id == id }
    }
}
