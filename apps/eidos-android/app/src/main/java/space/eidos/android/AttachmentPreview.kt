package space.eidos.android

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.net.URI
import java.nio.file.Files
import java.util.UUID
import org.json.JSONObject

data class AttachmentPreview(
    val name: String,
    val mediaType: String,
    val uri: Uri,
    val image: Bitmap? = null,
    val remote: Boolean = false,
)

/** Host resource resolution; canonical entry validation remains in the Runtime. */
internal fun prepareAttachmentPreview(
    context: Context,
    root: File,
    document: String,
    entry: JSONObject,
): AttachmentPreview {
    val name = entry.getString("name")
    val mediaType = entry.getString("mediaType")
    val reference = entry.getString("uri")
    if (URI(reference).scheme.equals("https", ignoreCase = true))
        return AttachmentPreview(
            name,
            mediaType,
            Uri.parse(reference).buildUpon().scheme("https").build(),
            remote = true,
        )
    val cache =
        File(context.cacheDir, "attachment-previews").apply {
            check(isDirectory || mkdirs()) { "无法创建附件缓存" }
        }
    // Snapshots remain available when another app reads them after the chooser returns.
    // Bound storage independently of attachment metadata and keep no Space paths in grants.
    val old =
        cache
            .listFiles()
            .orEmpty()
            .filter { it.isDirectory && !Files.isSymbolicLink(it.toPath()) }
            .sortedBy { it.lastModified() }
    var bytes = old.sumOf { File(it, "resource").length() }
    old.forEach {
        if (
            bytes > 192L * 1024 * 1024 ||
                System.currentTimeMillis() - it.lastModified() > 24 * 60 * 60 * 1000L
        ) {
            val resource = File(it, "resource")
            val size = resource.length()
            if (resource.delete()) bytes -= size
            it.delete()
        }
    }
    val directory =
        File(cache, UUID.randomUUID().toString()).apply { check(mkdir()) { "无法创建附件快照" } }
    val target = File(directory, "resource")
    try {
        val input =
            if (reference.startsWith("data:")) {
                Base64.decode(reference.substringAfter(','), Base64.DEFAULT).inputStream()
            } else {
                val relative = URI(reference)
                require(
                    relative.scheme == null &&
                        relative.rawAuthority == null &&
                        relative.rawQuery == null &&
                        relative.rawFragment == null
                ) {
                    "不支持此附件地址"
                }
                val parent = File(root, document).parentFile!!.canonicalFile
                val decoded = relative.path
                require(
                    decoded.isNotEmpty() && !decoded.startsWith('/') && !decoded.contains('\\')
                ) {
                    "附件地址无效"
                }
                val file = File(parent, decoded).canonicalFile
                require(file.toPath().startsWith(parent.toPath()) && file != parent) {
                    "附件超出数据文件所在目录"
                }
                require(file.toPath().startsWith(root.canonicalFile.toPath())) { "附件超出 Space" }
                var component = root
                File(root, document)
                    .parentFile!!
                    .relativeTo(root)
                    .invariantSeparatorsPath
                    .split('/')
                    .filter { it.isNotEmpty() }
                    .plus(decoded.split('/'))
                    .forEach {
                        require(it == ".." || it == "." || !it.startsWith('.')) { "附件不能访问内部目录" }
                        component = File(component, it)
                        require(!Files.isSymbolicLink(component.toPath())) { "附件不能经过符号链接" }
                    }
                require(file.isFile) { "附件文件不存在" }
                file.inputStream()
            }
        input.use { source ->
            FileOutputStream(target).use { output ->
                val buffer = ByteArray(64 * 1024)
                var copied = 0L
                while (true) {
                    val count = source.read(buffer)
                    if (count < 0) break
                    copied += count
                    require(copied <= 64L * 1024 * 1024) { "附件超过 64 MiB 打开限制" }
                    output.write(buffer, 0, count)
                }
                output.fd.sync()
            }
        }
        val bitmap =
            if (mediaType.startsWith("image/") && mediaType != "image/svg+xml")
                runCatching {
                        ImageDecoder.decodeBitmap(ImageDecoder.createSource(target)) {
                            decoder,
                            info,
                            _ ->
                            val ratio =
                                minOf(1.0, 2048.0 / maxOf(info.size.width, info.size.height))
                            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                            decoder.setTargetColorSpace(
                                android.graphics.ColorSpace.get(
                                    android.graphics.ColorSpace.Named.SRGB
                                )
                            )
                            decoder.setTargetSize(
                                maxOf(1, (info.size.width * ratio).toInt()),
                                maxOf(1, (info.size.height * ratio).toInt()),
                            )
                        }
                    }
                    .getOrNull()
            else null
        return AttachmentPreview(
            name,
            mediaType,
            FileProvider.getUriForFile(context, "${context.packageName}.attachments", target, name),
            bitmap,
        )
    } catch (error: Exception) {
        target.delete()
        directory.delete()
        throw error
    }
}
