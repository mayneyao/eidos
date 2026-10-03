package space.eidos.android

import android.text.Spannable
import android.text.TextPaint
import android.text.style.ClickableSpan
import android.text.style.LeadingMarginSpan
import android.view.View
import android.widget.TextView
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.MarkwonVisitor
import io.noties.markwon.core.spans.BulletListItemSpan
import org.commonmark.node.*
import org.commonmark.parser.IncludeSourceSpans
import org.commonmark.parser.Parser

internal data class MarkdownTask(val offset: Int, val checked: Boolean)

/** Parser source spans exclude fenced code, escaped markers and non-list paragraphs. */
internal fun markdownTasks(source: String, root: Node): Map<Text, MarkdownTask> {
    val lines = mutableListOf(0)
    var index = 0
    while (index < source.length) {
        if (source[index] == '\r') {
            if (source.getOrNull(index + 1) == '\n') index++
            lines.add(index + 1)
        } else if (source[index] == '\n') lines.add(index + 1)
        index++
    }
    val tasks = mutableMapOf<Text, MarkdownTask>()
    root.accept(
        object : AbstractVisitor() {
            override fun visit(item: ListItem) {
                val paragraph = item.firstChild as? Paragraph
                val text = paragraph?.firstChild as? Text
                val span = paragraph?.sourceSpans?.firstOrNull()
                if (
                    text != null &&
                        span != null &&
                        Regex("^\\[[ xX]]\\s").containsMatchIn(text.literal)
                ) {
                    val offset =
                        (lines.getOrNull(span.lineIndex) ?: source.length) + span.columnIndex
                    val marker =
                        source.substring(
                            offset.coerceAtMost(source.length),
                            (offset + 3).coerceAtMost(source.length),
                        )
                    if (marker == text.literal.take(3))
                        tasks[text] = MarkdownTask(offset + 1, marker[1] != ' ')
                }
                visitChildren(item)
            }
        }
    )
    return tasks
}

internal class MarkdownTasksPlugin(
    private val source: String,
    private val toggle: (MarkdownTask) -> Unit,
) : AbstractMarkwonPlugin() {
    private var tasks: Map<Text, MarkdownTask> = emptyMap()
    private val renderedTasks = mutableSetOf<Int>()

    override fun configureParser(builder: Parser.Builder) {
        builder.includeSourceSpans(IncludeSourceSpans.BLOCKS)
    }

    override fun beforeRender(node: Node) {
        tasks = markdownTasks(source, node)
        renderedTasks.clear()
    }

    override fun afterSetText(textView: TextView) {
        val text = textView.text as? Spannable ?: return
        text.getSpans(0, text.length, BulletListItemSpan::class.java).forEach { span ->
            val start = text.getSpanStart(span)
            if (start in renderedTasks) {
                val end = text.getSpanEnd(span)
                val flags = text.getSpanFlags(span)
                text.removeSpan(span)
                text.setSpan(
                    LeadingMarginSpan.Standard(span.getLeadingMargin(true)),
                    start,
                    end,
                    flags,
                )
            }
        }
    }

    override fun configureVisitor(builder: MarkwonVisitor.Builder) {
        builder.on(Text::class.java) { visitor, node ->
            val task = tasks[node]
            if (task == null) visitor.builder().append(node.literal)
            else {
                val start = visitor.length()
                renderedTasks.add(start)
                visitor.builder().append(if (task.checked) "☑" else "☐")
                visitor.setSpans(
                    start,
                    object : ClickableSpan() {
                        override fun onClick(widget: View) {
                            toggle(task)
                        }

                        override fun updateDrawState(ds: TextPaint) {
                            ds.isUnderlineText = false
                        }
                    },
                )
                visitor.builder().append(node.literal.substring(3))
            }
        }
    }
}
