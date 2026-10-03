package space.eidos.android

data class MergeFile(
    val path: String,
    val resolved: Boolean,
    val hasOurs: Boolean,
    val hasTheirs: Boolean,
)

data class MergeReview(val token: String, val files: List<MergeFile>, val unresolved: Int)

data class MergeComparison(val path: String, val ours: String, val theirs: String)
