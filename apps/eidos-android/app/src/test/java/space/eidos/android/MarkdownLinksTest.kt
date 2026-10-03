package space.eidos.android

import org.junit.Assert.*
import org.junit.Test

class MarkdownLinksTest {
    @Test
    fun resolvesSiblingParentAndEncodedNames() {
        assertEquals("notes/另一篇.md", markdownLocalPath("notes/start.md", "./另一篇.md"))
        assertEquals("资料/a b+.eidos", markdownLocalPath("notes/start.md", "../资料/a%20b+.eidos"))
        assertEquals("notes/%2e.md", markdownLocalPath("notes/start.md", "%252e.md"))
    }

    @Test
    fun rejectsOutsideInternalAndUnsupportedTargets() {
        listOf(
                "../../secret.md",
                "%2e%2e/%2e%2e/secret",
                "/etc/passwd",
                "//host/path",
                "file:///secret",
                ".graft/config",
                "%2egraft/config",
                "a%00.md",
                "a%5cb.md",
                "#section",
                "note.md?q=1",
            )
            .forEach {
                assertThrows(it, IllegalArgumentException::class.java) {
                    markdownLocalPath("notes/start.md", it)
                }
            }
    }
}
