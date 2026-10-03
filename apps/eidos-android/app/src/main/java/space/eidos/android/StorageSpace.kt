package space.eidos.android

import java.io.File
import java.io.IOException

/** A preflight guard; atomic writes still handle races with other disk users. */
class StorageSpace(private val availableBytes: (File) -> Long = { it.usableSpace }) {
    fun requireBytes(directory: File, bytes: Long) {
        require(bytes >= 0)
        val available = availableBytes(directory)
        if (available < RESERVE || bytes > available - RESERVE) {
            throw IOException("本机空间不足，请释放空间后重试；已有文件未被覆盖")
        }
    }

    companion object {
        const val RESERVE = 1024L * 1024
    }
}
