package space.eidos.android

import android.content.ContentResolver
import android.net.Uri
import android.provider.DocumentsContract
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files

/** Copies an entire directory while retaining relative attachment paths. */
internal class DocumentTreeTransfer(
    private val resolver: ContentResolver,
    private val storageSpace: StorageSpace = StorageSpace(),
) {
    private val columns =
        arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        )
    private var entries = 0
    private val visited = mutableSetOf<String>()

    private fun name(value: String): String {
        require(
            value.isNotBlank() &&
                value != "." &&
                value != ".." &&
                value.none { it == '/' || it == '\\' || it.code < 32 }
        ) {
            tr("目录包含无效名称")
        }
        return value
    }

    fun import(tree: Uri, destination: File): String {
        val document =
            DocumentsContract.buildDocumentUriUsingTree(
                tree,
                DocumentsContract.getTreeDocumentId(tree),
            )
        val title =
            resolver.query(document, columns, null, null, null)?.use {
                check(it.moveToFirst()) { tr("无法读取目录") }
                name(it.getString(1))
            } ?: error(tr("无法读取目录"))
        readDirectory(tree, DocumentsContract.getDocumentId(document), destination, 0)
        return title
    }

    private fun readDirectory(tree: Uri, id: String, target: File, depth: Int) {
        check(depth <= 64 && visited.add(id)) { tr("目录层级过深或存在循环") }
        check(target.isDirectory || target.mkdirs()) { tr("无法创建导入目录") }
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, id)
        val cursor = checkNotNull(resolver.query(children, columns, null, null, null)) { tr("无法读取子目录") }
        cursor.use {
            while (it.moveToNext()) {
                check(++entries <= 100_000) { tr("目录文件数量超过限制") }
                val childId = it.getString(0)
                val childName = name(it.getString(1))
                // App-private histories are not portable user content.
                if (childName.startsWith('.')) continue
                val child = File(target, childName)
                check(!child.exists()) { tr("目录中存在重复名称") }
                if (it.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR) {
                    readDirectory(tree, childId, child, depth + 1)
                } else {
                    val uri = DocumentsContract.buildDocumentUriUsingTree(tree, childId)
                    checkNotNull(resolver.openInputStream(uri)) { tr("无法读取 {0}", childName) }
                        .use { input ->
                            FileOutputStream(child).use { output ->
                                val buffer = ByteArray(64 * 1024)
                                while (true) {
                                    val count = input.read(buffer)
                                    if (count < 0) break
                                    storageSpace.requireBytes(target, count.toLong())
                                    output.write(buffer, 0, count)
                                }
                                output.fd.sync()
                            }
                        }
                }
            }
        }
    }

    fun export(source: File, tree: Uri, title: String) {
        val parent =
            DocumentsContract.buildDocumentUriUsingTree(
                tree,
                DocumentsContract.getTreeDocumentId(tree),
            )
        // A newly created child is the only external content we own or clean up.
        val created =
            checkNotNull(
                DocumentsContract.createDocument(
                    resolver,
                    parent,
                    DocumentsContract.Document.MIME_TYPE_DIR,
                    name(title),
                )
            ) {
                tr("无法创建导出目录")
            }
        try {
            writeDirectory(source, created, 0)
        } catch (error: Exception) {
            try {
                check(DocumentsContract.deleteDocument(resolver, created)) { tr("无法清理未完成的导出目录") }
            } catch (cleanup: Exception) {
                throw IllegalStateException(tr("导出未完成，目标中可能保留不完整副本，请检查后移除。{0}", error.message), cleanup)
            }
            throw error
        }
    }

    private fun writeDirectory(source: File, target: Uri, depth: Int) {
        check(depth <= 64) { tr("目录层级过深") }
        val children = checkNotNull(source.listFiles()) { tr("无法读取本机目录") }
        for (file in children.sortedBy { it.name }) {
            if (file.name.startsWith('.')) continue
            check(++entries <= 100_000) { tr("目录文件数量超过限制") }
            check(!Files.isSymbolicLink(file.toPath())) { tr("目录含符号链接，无法完整导出") }
            val mime =
                if (file.isDirectory) DocumentsContract.Document.MIME_TYPE_DIR
                else "application/octet-stream"
            check(file.isDirectory || file.isFile) { tr("目录包含不支持的文件") }
            val child =
                checkNotNull(
                    DocumentsContract.createDocument(resolver, target, mime, name(file.name))
                ) {
                    tr("无法导出 {0}", file.name)
                }
            val actualName =
                resolver
                    .query(
                        child,
                        arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME),
                        null,
                        null,
                        null,
                    )
                    ?.use { if (it.moveToFirst()) it.getString(0) else null }
            check(actualName == file.name) { tr("目标位置更改了文件名，无法保留相对链接，请选择其他目录") }
            if (file.isDirectory) writeDirectory(file, child, depth + 1)
            else
                file.inputStream().use { input ->
                    checkNotNull(resolver.openOutputStream(child, "wt")) { tr("无法写入 {0}", file.name) }
                        .use { input.copyTo(it) }
                }
        }
    }
}
