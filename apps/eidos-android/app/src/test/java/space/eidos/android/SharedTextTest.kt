package space.eidos.android

import org.junit.Assert.*
import org.junit.Test

class SharedTextTest {
    @Test
    fun preservesBodyAndAddsSeparateTitleWithoutDuplicatingAnExistingHeading() {
        val body = "https://example.org/a?q=1\n附带说明\n"
        assertEquals("文章标题\n\n$body", sharedText(" 文章标题 ", body))
        assertEquals(body, sharedText(null, body))
        assertEquals("文章标题\n\n$body", sharedText("文章标题", "文章标题\n\n$body"))
        assertEquals("文章标题", sharedText("文章标题", null))
        assertNull(sharedText(null, null))
    }
}
