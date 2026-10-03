package space.eidos.android

import org.junit.Assert.assertEquals
import org.junit.Test

class MarkdownFormattingTest {
    @Test
    fun wrapsSelectionAndTogglesWithoutLosingUnicode() {
        val wrapped = formatMarkdown("中文 🌱 记录", 3, 5, MarkdownFormat.Bold)
        assertEquals(MarkdownEdit("中文 **🌱** 记录", 5, 7), wrapped)
        assertEquals(
            MarkdownEdit("中文 🌱 记录", 3, 5),
            formatMarkdown(wrapped.text, wrapped.end, wrapped.start, MarkdownFormat.Bold),
        )
    }

    @Test
    fun emptySelectionPlacesCaretBetweenMarkers() {
        assertEquals(
            MarkdownEdit("ab****cd", 4, 4),
            formatMarkdown("abcd", 2, 2, MarkdownFormat.Bold),
        )
    }

    @Test
    fun lineSelectionExcludesFollowingLineAndCanToggle() {
        val edited = formatMarkdown("一\n二\n三", 0, 4, MarkdownFormat.Task)
        assertEquals(MarkdownEdit("- [ ] 一\n- [ ] 二\n三", 0, 15), edited)
        assertEquals(
            MarkdownEdit("一\n二\n三", 0, 3),
            formatMarkdown(edited.text, edited.start, edited.end, MarkdownFormat.Task),
        )
    }

    @Test
    fun lineInsertionPreservesCaretAndTrailingBlankLine() {
        assertEquals(
            MarkdownEdit("一\n## 二", 6, 6),
            formatMarkdown("一\n二", 3, 3, MarkdownFormat.Heading),
        )
        assertEquals(MarkdownEdit("一\n> ", 4, 4), formatMarkdown("一\n", 2, 2, MarkdownFormat.Quote))
    }

    @Test
    fun linkSelectsDestinationForImmediateTyping() {
        val edited = formatMarkdown("参考文档", 2, 4, MarkdownFormat.Link)
        assertEquals("参考[文档](https://)", edited.text)
        assertEquals("https://", edited.text.substring(edited.start, edited.end))
    }

    @Test
    fun codeHandlesEmbeddedBackticksAndMultilineSelections() {
        assertEquals(
            MarkdownEdit("`` `x` ``", 3, 6),
            formatMarkdown("`x`", 0, 3, MarkdownFormat.Code),
        )
        val source = "前a\nb后"
        val edited = formatMarkdown(source, 1, 4, MarkdownFormat.Code)
        assertEquals("前\n```\na\nb\n```\n后", edited.text)
        assertEquals("a\nb", edited.text.substring(edited.start, edited.end))
    }
}
