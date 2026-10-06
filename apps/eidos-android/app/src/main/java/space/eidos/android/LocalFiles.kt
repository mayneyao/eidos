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
