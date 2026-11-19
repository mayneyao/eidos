package space.eidos.android

import org.junit.Assert.assertEquals
import org.junit.Test

class AppLanguageTest {
    @Test fun resolvesPortugueseAndPreservesExplicitPreferences() {
        listOf("pt-BR", "pt", "pt-PT", "PT_br").forEach {
            assertEquals("pt-BR", AppLanguage.resolve("system", listOf(it)))
        }
        assertEquals("pt-BR", AppLanguage.resolve("pt-BR", listOf("zh-CN")))
        assertEquals("en", AppLanguage.resolve("en", listOf("pt-BR")))
    }
    @Test fun resolvesSystemChineseAndFallsBackToEnglish() {
        listOf("zh", "zh-CN", "zh-Hant-TW", "ZH_hk").forEach {
            assertEquals("zh", AppLanguage.resolve("system", listOf(it)))
        }
        listOf("en-US", "ja-JP", "fr", "").forEach {
            assertEquals("en", AppLanguage.resolve("system", listOf(it, "zh")))
        }
        assertEquals("en", AppLanguage.resolve("system", emptyList()))
    }
    @Test fun explicitPreferenceOverridesSystemAndInvalidPreferenceFollowsSystem() {
        assertEquals("en", AppLanguage.resolve("en", listOf("zh-CN")))
        assertEquals("zh", AppLanguage.resolve("zh", listOf("en-US")))
        assertEquals("zh", AppLanguage.resolve("invalid", listOf("zh-CN")))
    }
}
