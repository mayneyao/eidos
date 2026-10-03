package space.eidos.android

import org.commonmark.parser.IncludeSourceSpans
import org.commonmark.parser.Parser
import org.junit.Assert.*
import org.junit.Test

class MarkdownTasksTest {
    private val parser = Parser.builder().includeSourceSpans(IncludeSourceSpans.BLOCKS).build()

    @Test
    fun mapsNestedRepeatedTasksWithOriginalLineEndingsAndUnicode() {
        val source = "# 😀\r\n\r\n- [ ] 重复\r\n  - [X] 重复\r\n\r\n> 1. [x] 引用\r\n"
        val tasks = markdownTasks(source, parser.parse(source)).values.toList()
        assertEquals(
            listOf(source.indexOf("[ ]") + 1, source.indexOf("[X]") + 1, source.indexOf("[x]") + 1),
            tasks.map { it.offset },
        )
        assertEquals(listOf(false, true, true), tasks.map { it.checked })
    }

    @Test
    fun ignoresCodeEscapesOrdinaryParagraphsAndLaterListParagraphs() {
        val source =
            "```md\n- [ ] fenced\n```\n\n    - [ ] indented\n\n[ ] ordinary\n\n- \\[ ] escaped\n- `[ ] inline`\n- paragraph\n\n  [ ] later paragraph\n\n- [ ] **real**\n"
        val tasks = markdownTasks(source, parser.parse(source)).values.toList()
        assertEquals(listOf(MarkdownTask(source.indexOf("[ ] **real**") + 1, false)), tasks)
    }
}
