package space.eidos.android

import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract.Document
import android.provider.DocumentsProvider
import java.io.File

/** Isolated local SAF fixture; never included in release APKs. */
class TestTreeProvider : DocumentsProvider() {
    private val root
        get() = File(context!!.cacheDir, "test-tree").canonicalFile.apply { mkdirs() }

    private fun file(id: String): File =
        File(root, id).canonicalFile.also {
            require(it.toPath().startsWith(root.canonicalFile.toPath()))
        }

    override fun onCreate() = true

    override fun isChildDocument(parentDocumentId: String, documentId: String) =
        file(documentId).toPath().startsWith(file(parentDocumentId).toPath())

    override fun queryRoots(projection: Array<out String>?) =
        MatrixCursor(projection ?: arrayOf("root_id"))

    private fun rows(projection: Array<out String>?, files: List<File>): MatrixCursor {
        val columns =
            projection
                ?: arrayOf(
                    Document.COLUMN_DOCUMENT_ID,
                    Document.COLUMN_DISPLAY_NAME,
                    Document.COLUMN_MIME_TYPE,
                )
        return MatrixCursor(columns).apply {
            files.forEach { f ->
                addRow(
                    columns
                        .map { column ->
                            when (column) {
                                Document.COLUMN_DOCUMENT_ID ->
                                    f.relativeTo(root).invariantSeparatorsPath
                                Document.COLUMN_DISPLAY_NAME -> f.name
                                Document.COLUMN_MIME_TYPE ->
                                    if (f.isDirectory) Document.MIME_TYPE_DIR
                                    else "application/octet-stream"
                                Document.COLUMN_SIZE -> f.length()
                                else -> 0
                            }
                        }
                        .toTypedArray()
                )
            }
        }
    }

    override fun queryDocument(documentId: String, projection: Array<out String>?) =
        rows(projection, listOf(file(documentId)))

    override fun queryChildDocuments(
        parentDocumentId: String,
        projection: Array<out String>?,
        sortOrder: String?,
    ) = rows(projection, file(parentDocumentId).listFiles()!!.sortedBy { it.name })

    override fun openDocument(
        documentId: String,
        mode: String,
        signal: CancellationSignal?,
    ): ParcelFileDescriptor {
        check(!documentId.endsWith("fail.bin")) { "Injected transfer failure" }
        return ParcelFileDescriptor.open(file(documentId), ParcelFileDescriptor.parseMode(mode))
    }

    override fun createDocument(
        parentDocumentId: String,
        mimeType: String,
        displayName: String,
    ): String {
        val parent = file(parentDocumentId)
        var child = File(parent, if (displayName == "rename.bin") "renamed.bin" else displayName)
        var index = 2
        while (child.exists()) child = File(parent, "$displayName (${index++})")
        check(if (mimeType == Document.MIME_TYPE_DIR) child.mkdir() else child.createNewFile())
        return child.relativeTo(root).invariantSeparatorsPath
    }

    override fun deleteDocument(documentId: String) {
        check(file(documentId).deleteRecursively())
    }
}
