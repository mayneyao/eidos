package space.eidos.android

internal enum class MarkdownFormat(val label: String) {
    Heading("标题"),
    Bold("加粗"),
    Italic("斜体"),
    Bullet("列表"),
    Task("待办"),
    Quote("引用"),
    Code("代码"),
    Link("链接"),
}

internal data class MarkdownEdit(val text: String, val start: Int, val end: Int)

/** Source editing only: rendering and persisted content remain ordinary Markdown. */
internal fun formatMarkdown(
    text: String,
    anchor: Int,
    caret: Int,
    format: MarkdownFormat,
): MarkdownEdit {
    val start = minOf(anchor, caret).coerceIn(0, text.length)
    val end = maxOf(anchor, caret).coerceIn(0, text.length)
    val selected = text.substring(start, end)
    val prefix =
        when (format) {
            MarkdownFormat.Heading -> "## "
            MarkdownFormat.Bullet -> "- "
            MarkdownFormat.Task -> "- [ ] "
            MarkdownFormat.Quote -> "> "
            else -> null
        }
    if (prefix != null) {
        val lineStart = if (start == 0) 0 else text.lastIndexOf('\n', start - 1) + 1
        // A selection ending at the next line's start does not include that line.
        val last = if (end > start && text[end - 1] == '\n') end - 1 else end
        val lineEnd = text.indexOf('\n', last).let { if (it < 0) text.length else it }
        val lines = text.substring(lineStart, lineEnd).split('\n')
        val remove = lines.all { it.startsWith(prefix) }
        val changed =
            lines.joinToString("\n") { if (remove) it.removePrefix(prefix) else prefix + it }
        val result = text.replaceRange(lineStart, lineEnd, changed)
        if (start == end) {
            val position =
                if (remove) maxOf(lineStart, start - prefix.length) else start + prefix.length
            return MarkdownEdit(result, position, position)
        }
        return MarkdownEdit(result, lineStart, lineStart + changed.length)
    }
    if (format == MarkdownFormat.Link) {
        val label = selected.ifEmpty { "链接文字" }
        val replacement = "[$label](https://)"
        val urlStart = start + label.length + 3
        return MarkdownEdit(text.replaceRange(start, end, replacement), urlStart, urlStart + 8)
    }
    if (format == MarkdownFormat.Code && ('`' in selected || '\n' in selected)) {
        val longestRun = Regex("`+").findAll(selected).maxOfOrNull { it.value.length } ?: 0
        if ('\n' in selected) {
            val fence = "`".repeat(maxOf(3, longestRun + 1))
            val before = (if (start > 0 && text[start - 1] != '\n') "\n" else "") + fence + "\n"
            val after =
                (if (selected.endsWith('\n')) "" else "\n") +
                    fence +
                    (if (end < text.length && text[end] != '\n') "\n" else "")
            return MarkdownEdit(
                text.replaceRange(start, end, before + selected + after),
                start + before.length,
                end + before.length,
            )
        }
        val delimiter = "`".repeat(longestRun + 1)
        val padding = if (selected.startsWith('`') || selected.endsWith('`')) " " else ""
        val before = delimiter + padding
        return MarkdownEdit(
            text.replaceRange(start, end, before + selected + padding + delimiter),
            start + before.length,
            end + before.length,
        )
    }
    val marker =
        when (format) {
            MarkdownFormat.Bold -> "**"
            MarkdownFormat.Italic -> "*"
            else -> "`"
        }
    if (
        start >= marker.length &&
            text.substring(start - marker.length, start) == marker &&
            text.substring(end).startsWith(marker)
    ) {
        return MarkdownEdit(
            text.replaceRange(start - marker.length, end + marker.length, selected),
            start - marker.length,
            end - marker.length,
        )
    }
    return MarkdownEdit(
        text.replaceRange(start, end, marker + selected + marker),
        start + marker.length,
        end + marker.length,
    )
}
