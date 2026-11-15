package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Exercises the APK's JNI/QuickJS/SQLite boundary, including persisted constraints. */
class CheckboxRuntimeReleaseTest {
    private fun revision(file: File): String =
        NativeRuntime.call(file.path, "web:getSnapshot").getString("revision")

    private fun objects(file: File): List<JSONObject> {
        val values = NativeRuntime.call(file.path, "schema").getJSONArray("objects")
        return (0 until values.length()).map(values::getJSONObject)
    }

    private fun preflight(file: File, change: JSONObject): JSONObject =
        NativeRuntime.call(
            file.path,
            "web:preflightSchema",
            JSONObject().put("expectedRevision", revision(file)).put("change", change),
        )

    private fun apply(file: File, plan: JSONObject, confirm: Boolean = false): JSONObject =
        NativeRuntime.call(
            file.path,
            "web:mutateSchema",
            JSONObject()
                .put("expectedRevision", plan.getString("baseRevision"))
                .put("planToken", plan.getString("planToken"))
                .put("actionsHash", plan.getString("actionsHash"))
                .apply { if (confirm) put("confirmLossy", true) },
        )

    private fun mutate(file: File, table: String, changes: JSONArray): JSONObject =
        NativeRuntime.call(
            file.path,
            "web:mutateRows",
            JSONObject()
                .put("tableId", table)
                .put("expectedRevision", revision(file))
                .put("changes", changes),
        )

    private fun rows(file: File, table: String, fields: List<String>): JSONArray =
        NativeRuntime.call(
                file.path,
                "web:queryRows",
                JSONObject()
                    .put("tableId", table)
                    .put("query", JSONObject())
                    .put("projection", JSONObject().put("fields", JSONArray(fields)).put("resolveRelations", JSONArray()))
                    .put("limit", 50),
            )
            .getJSONArray("rows")

    @Test
    fun nativeCreationAndAddedCheckboxStayBinaryWithoutChangingLegacyNull() {
        val root = File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "checkbox-${UUID.randomUUID()}")
        check(root.mkdirs())
        val file = File(root, "checks.eidos")
        try {
            NativeRuntime.call(
                file.path,
                "create",
                JSONObject("""{"title":"Native binary","fields":[{"clientKey":"title","name":"Title","kind":"text","position":"0"},{"clientKey":"flag","name":"Flag","kind":"checkbox","position":"1"},{"clientKey":"legacy","name":"Legacy","kind":"checkbox","nullable":true,"position":"2"}]}"""),
            )
            val schema = objects(file)
            val table = schema.single { it.getString("object") == "table" }.getString("id")
            val flag = schema.single { it.optString("name") == "Flag" }
            val legacy = schema.single { it.optString("name") == "Legacy" }
            assertFalse(flag.getBoolean("nullable"))
            assertTrue(legacy.getBoolean("nullable"))
            mutate(file, table, JSONArray().put(JSONObject().put("kind", "create").put("clientKey", "one")
                .put("values", JSONObject().put(legacy.getString("id"), JSONObject.NULL))))
            val first = rows(file, table, listOf(flag.getString("id"), legacy.getString("id"))).getJSONObject(0)
            assertEquals(false, first.getJSONArray("values").get(0))
            assertTrue(first.getJSONArray("values").isNull(1))
            apply(file, preflight(file, JSONObject().put("kind", "create-field").put("tableId", table)
                .put("field", JSONObject("""{"clientKey":"added","name":"Added","kind":"checkbox","position":"3"}"""))))
            val added = objects(file).single { it.optString("name") == "Added" }
            assertFalse(added.getBoolean("nullable"))
            val before = revision(file)
            val failed = runCatching {
                mutate(file, table, JSONArray()
                    .put(JSONObject().put("kind", "update").put("rowId", first.getString("id"))
                        .put("values", JSONObject().put(flag.getString("id"), true)))
                    .put(JSONObject().put("kind", "create").put("clientKey", "invalid")
                        .put("values", JSONObject().put(added.getString("id"), JSONObject.NULL))))
            }
            assertTrue("typed NULL must reject the entire native batch", failed.isFailure)
            assertEquals(before, revision(file))
            NativeRuntime.close()
            val reopened = rows(file, table, listOf(flag.getString("id"), added.getString("id"), legacy.getString("id")))
            assertEquals(1, reopened.length())
            assertEquals(false, reopened.getJSONObject(0).getJSONArray("values").get(0))
            assertEquals(false, reopened.getJSONObject(0).getJSONArray("values").get(1))
            assertTrue(reopened.getJSONObject(0).getJSONArray("values").isNull(2))
        } finally {
            NativeRuntime.close()
            root.deleteRecursively()
        }
    }

    @Test
    fun nativeConversionRequiresReviewedNullCountAndRejectsStaleApproval() {
        val root = File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "conversion-${UUID.randomUUID()}")
        check(root.mkdirs())
        val file = File(root, "convert.eidos")
        try {
            NativeRuntime.call(file.path, "create", JSONObject("""{"title":"Native conversion","fields":[{"clientKey":"title","name":"Title","kind":"text","position":"0"},{"clientKey":"flag","name":"Flag","kind":"text","position":"1"}]}"""))
            val schema = objects(file)
            val table = schema.single { it.getString("object") == "table" }.getString("id")
            val flag = schema.single { it.optString("name") == "Flag" }.getString("id")
            mutate(file, table, JSONArray().put(JSONObject().put("kind", "create").put("clientKey", "empty").put("values", JSONObject())))
            val change = JSONObject().put("kind", "convert-field").put("fieldId", flag).put("to", "checkbox")
                .put("toNullable", false).put("policies", JSONArray().put("null-to-false"))
            val review = preflight(file, change)
            assertEquals("explicit-lossy", review.getString("classification"))
            assertEquals("1", review.getJSONArray("valueChanges").getJSONObject(0).getString("rows"))
            assertTrue(runCatching { apply(file, review) }.isFailure)
            val stale = preflight(file, change)
            mutate(file, table, JSONArray().put(JSONObject().put("kind", "create").put("clientKey", "second").put("values", JSONObject())))
            assertTrue(runCatching { apply(file, stale, true) }.isFailure)
            val current = preflight(file, change)
            assertEquals("2", current.getJSONArray("valueChanges").getJSONObject(0).getString("rows"))
            apply(file, current, true)
            NativeRuntime.close()
            assertFalse(objects(file).single { it.optString("name") == "Flag" }.getBoolean("nullable"))
            val reopened = rows(file, table, listOf(flag))
            assertEquals(2, reopened.length())
            for (i in 0 until reopened.length()) assertEquals(false, reopened.getJSONObject(i).getJSONArray("values").get(0))
        } finally {
            NativeRuntime.close()
            root.deleteRecursively()
        }
    }
}
