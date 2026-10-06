package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class MobileThemeDisabledTest {
    @Test
    fun ignoresPreviouslyEnabledThemesAndRejectsActivation() = runBlocking {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "theme-disabled-${UUID.randomUUID()}"
        val preferences = app.getSharedPreferences(name, 0)
        val store = PluginMarketStore(app, name)
        val manifest = JSONObject().put("id", "test.theme").put("kind", "theme")
        try {
            preferences
                .edit()
                .putString(
                    "installed",
                    JSONObject()
                        .put(
                            "test.theme",
                            JSONObject().put("manifest", manifest).put("revision", "old"),
                        )
                        .toString(),
                )
                .putString("enabled:test:test.theme", "old")
                .commit()
            val plugin = store.installed("test").single()
            assertFalse(plugin.enabled)
            assertTrue(runCatching { store.setEnabled("test", plugin, true) }.isFailure)
            assertTrue(runCatching { store.program("test", plugin.id) }.isFailure)
            store.setEnabled("test", plugin, false)
            assertNull(preferences.getString("enabled:test:test.theme", null))
        } finally {
            preferences.edit().clear().commit()
            File(app.filesDir, "$name-packages").deleteRecursively()
        }
    }
}
