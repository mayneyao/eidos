package space.eidos.android

import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest

/** Filesystem rules shared by production and JVM tests. */
class LocalFiles(
    private val root: File,
    private val staging: File? = null,
    private val storageSpace: StorageSpace = StorageSpace(),
) {
    init {
        check(root.isDirectory || root.mkdirs()) { tr("无法创建 Space") }
        if (staging != null) check(staging.isDirectory || staging.mkdirs()) { tr("无法创建临时目录") }
    }

    fun resolve(relative: String): File {
        require(!File(relative).isAbsolute) { tr("需要 Space 内的相对路径") }
        val target = File(root, relative).canonicalFile
        require(target.toPath().startsWith(root.canonicalFile.toPath())) { tr("路径超出 Space") }
        require(relative.split('/').none { it.startsWith('.') && it != "" }) { tr("不能访问内部文件") }
        return target
    }

    fun digest(file: File): String {
        val hash = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val bytes = ByteArray(64 * 1024)
            while (true) {
                val length = input.read(bytes)
                if (length < 0) break
                hash.update(bytes, 0, length)
            }
        }
        return hash.digest().joinToString("") { "%02x".format(it) }
    }

    /** Validate before closing sessions or changing preferences. Never follow a symlink. */
    fun moveTarget(relative: String, folder: String): File {
        require(relative.isNotBlank()) { tr("不能移动 Space 根目录") }
        fun checked(path: String): File {
            require(!path.contains('\\') && path.split('/').none { it == "." || it == ".." }) {
                tr("需要 Space 内的相对路径")
            }
            var candidate = root
            path.split('/').filter { it.isNotEmpty() }.forEach {
                candidate = File(candidate, it)
                require(!Files.isSymbolicLink(candidate.toPath())) { tr("不能移动符号链接") }
            }
            return resolve(path)
        }
        val source = checked(relative)
        require(source != root.canonicalFile && (source.isFile || source.isDirectory)) { tr("文件暂时不可用") }
        val directory = checked(folder)
        require(directory.isDirectory) { tr("目录不存在") }
        require(!directory.toPath().startsWith(source.toPath())) { tr("不能将文件夹移入自身或子文件夹") }
        val target = checked(if (folder.isEmpty()) source.name else "$folder/${source.name}")
        check(target == source || !target.exists()) { tr("名称已存在") }
        if (source.isDirectory && source != target) Files.walk(source.toPath()).use { paths ->
            require(paths.noneMatch { Files.isSymbolicLink(it) }) { tr("不能移动符号链接") }
        }
        return target
    }

    fun move(relative: String, folder: String): File {
        val target = moveTarget(relative, folder)
        val source = resolve(relative)
        // No REPLACE_EXISTING/ATOMIC_MOVE: neither may silently replace a destination.
        if (source != target) Files.move(source.toPath(), target.toPath())
        return target
    }

    /** Keep removed files outside the synchronized Space so deletion is recoverable. */
    fun trash(relative: String, trashRoot: File) {
        require(relative.isNotBlank()) { tr("不能删除 Space 根目录") }
        var candidate = root
        relative.split('/').forEach { part ->
            candidate = File(candidate, part)
            require(!Files.isSymbolicLink(candidate.toPath())) { tr("不能删除符号链接") }
        }
        val source = resolve(relative)
        require(source != root.canonicalFile && source.exists()) { tr("文件暂时不可用") }
        val folder = File(trashRoot, java.util.UUID.randomUUID().toString())
        check(folder.mkdirs()) { tr("无法创建回收目录") }
        try {
            File(folder, "path").writeText(relative)
            Files.move(source.toPath(), File(folder, "payload").toPath(), StandardCopyOption.ATOMIC_MOVE)
        } catch (error: Exception) {
            File(folder, "path").delete()
            folder.delete()
            throw error
        }
    }

    fun readText(relative: String): Pair<String, String> {
        val file = resolve(relative)
        require(file.length() <= MAX_TEXT_BYTES) { tr("文件超过 2 MB，暂不支持在手机上编辑") }
        val bytes = file.readBytes()
        val text =
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString()
        val hash =
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") {
                "%02x".format(it)
            }
        return text to hash
    }

    fun writeText(relative: String, text: String, expectedDigest: String? = null): String {
        val target = resolve(relative)
        if (expectedDigest != null) {
            check(target.isFile && digest(target) == expectedDigest) {
                tr("文件已被其他操作修改。你的草稿已保留，请重新打开文件后处理。")
            }
        } else {
            check(!target.exists()) { tr("文件已存在，请使用其他名称") }
        }
        val bytes = text.toByteArray(Charsets.UTF_8)
        require(bytes.size <= MAX_TEXT_BYTES) { tr("内容超过 2 MB") }
        storageSpace.requireBytes(staging ?: target.parentFile!!, bytes.size.toLong())
        val temporary = File.createTempFile(".eidos-write-", ".tmp", staging ?: target.parentFile)
        try {
            FileOutputStream(temporary).use { output ->
                output.write(bytes)
                output.fd.sync()
            }
            Files.move(
                temporary.toPath(),
                target.toPath(),
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING,
            )
        } finally {
            temporary.delete()
        }
        return digest(target)
    }

    fun validName(value: String): String {
        val name = value.trim()
        require(
            name.isNotEmpty() &&
                !name.startsWith('.') &&
                name.none { it == '/' || it == '\\' || it.code < 32 }
        ) {
            tr("请输入有效的文件名称")
        }
        require(name.toByteArray().size <= 200) { tr("名称太长") }
        return name
    }

    companion object {
        const val MAX_TEXT_BYTES = 2 * 1024 * 1024
    }
}
