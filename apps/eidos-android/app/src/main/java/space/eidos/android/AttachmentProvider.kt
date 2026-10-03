package space.eidos.android

/** Separate identity from the debug-only fixture provider during manifest merging. */
class AttachmentProvider : androidx.core.content.FileProvider() {
    override fun getType(uri: android.net.Uri): String? {
        val type = uri.getQueryParameter("inboxMime")
        if (
            uri.pathSegments.firstOrNull() == "share-inbox" &&
                type != null &&
                type.matches(Regex("[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+"))
        )
            return type
        return super.getType(uri)
    }
}
