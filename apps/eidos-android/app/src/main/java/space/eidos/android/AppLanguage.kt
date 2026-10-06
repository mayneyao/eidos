package space.eidos.android

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.util.Locale

/** App-wide preference; system is deliberately stored separately from its resolved locale. */
internal object AppLanguage {
    private const val KEY = "app-language"
    private var preference by mutableStateOf("system")
    private var systemLanguage by mutableStateOf(Locale.getDefault().toLanguageTag())
    @Volatile private var english: Map<String, String> = emptyMap()
    val choices = listOf("system", "zh", "en")

    fun initialize(context: Context) {
        systemLanguage = context.resources.configuration.locales[0].toLanguageTag()
        preference = context.getSharedPreferences("appearance", Context.MODE_PRIVATE)
            .getString(KEY, "system").takeIf { it in choices } ?: "system"
        val catalog = JSONObject(context.assets.open("en.json").bufferedReader().use { it.readText() })
        english = catalog.keys().asSequence().associateWith { catalog.getString(it) }
    }

    fun selected() = preference
    fun resolve(preference: String, languages: List<String>): String = when (preference) {
        "zh", "en" -> preference
        else -> if (languages.firstOrNull()?.substringBefore('-')?.substringBefore('_')?.lowercase(Locale.ROOT) == "zh") "zh" else "en"
    }
    fun locale(): String = resolve(preference, listOf(systemLanguage))
    fun updateSystem(language: String) { systemLanguage = language }
    fun set(context: Context, value: String) {
        require(value in choices)
        context.getSharedPreferences("appearance", Context.MODE_PRIVATE).edit().putString(KEY, value).apply()
        preference = value
    }
    fun text(source: String): String = if (locale() == "en") english[source] ?: source else source
}

internal fun tr(source: String, vararg arguments: Any?): String =
    Regex("\\{(\\d+)\\}").replace(AppLanguage.text(source)) { match ->
        arguments.getOrNull(match.groupValues[1].toInt())?.toString() ?: match.value
    }

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun LanguageSheet(selected: String, select: (String) -> Unit, close: () -> Unit) {
    ModalBottomSheet(onDismissRequest = close) {
        Column(Modifier.selectableGroup().padding(bottom = 24.dp)) {
            Text(tr("语言"), Modifier.padding(horizontal = 24.dp, vertical = 12.dp))
            AppLanguage.choices.forEach { choice ->
                Row(
                    Modifier.fillMaxWidth().selectable(selected == choice, role = Role.RadioButton) { select(choice) }
                        .padding(horizontal = 24.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected == choice, onClick = null)
                    Text(when (choice) { "zh" -> "中文"; "en" -> "English"; else -> tr("跟随系统") }, Modifier.padding(start = 12.dp))
                }
            }
        }
    }
}
