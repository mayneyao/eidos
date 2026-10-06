package space.eidos.android

import java.text.Collator

data class FileSort(val by: String = "name", val descending: Boolean = false) {
    fun comparator(): Comparator<SpaceFile> {
        val collator = Collator.getInstance().apply { strength = Collator.PRIMARY }
        val pieces = Regex("[0-9]+|[^0-9]+")
        fun natural(left: String, right: String): Int {
            val a = pieces.findAll(left).map { it.value }.toList()
            val b = pieces.findAll(right).map { it.value }.toList()
            for (i in 0 until minOf(a.size, b.size)) {
                val result =
                    if (a[i].first() in '0'..'9' && b[i].first() in '0'..'9')
                        a[i].toBigInteger().compareTo(b[i].toBigInteger())
                    else collator.compare(a[i], b[i])
                if (result != 0) return result
            }
            return a.size.compareTo(b.size)
        }
        return Comparator { left, right ->
            if (left.directory != right.directory) return@Comparator if (left.directory) -1 else 1
            val primary =
                when (by) {
                    "modified" -> left.modified.compareTo(right.modified)
                    "type" ->
                        if (left.directory) 0
                        else
                            natural(
                                left.name.substringAfterLast('.', ""),
                                right.name.substringAfterLast('.', ""),
                            )
                    else -> 0
                }
            val result =
                primary.takeIf { it != 0 }
                    ?: natural(left.name, right.name).takeIf { it != 0 }
                    ?: left.path.compareTo(right.path)
            if (descending) -result else result
        }
    }
}
