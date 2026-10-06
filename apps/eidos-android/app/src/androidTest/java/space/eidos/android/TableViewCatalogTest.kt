package space.eidos.android

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class TableViewCatalogTest {
    @Test
    fun readsCapabilitiesStructurallyDespiteAndroidJsonSlashEscaping() {
        for (id in listOf("chart", "map")) {
            val manifest = JSONObject("""{"views":[{"id":"$id","kind":"file","capabilities":["eidos/table"]}],"placements":[{"location":"table/view","view":"$id"}]}""")
            assertFalse(manifest.getJSONArray("views").toString().contains("eidos/table"))
            assertTrue(hasTableView(manifest))
            manifest.getJSONArray("placements").getJSONObject(0).put("view", "other")
            assertFalse(hasTableView(manifest))
            manifest.getJSONArray("placements").getJSONObject(0).put("view", id)
            manifest.getJSONArray("views").getJSONObject(0).put("capabilities", org.json.JSONArray("[\"document\"]"))
            assertFalse(hasTableView(manifest))
        }
    }
}
