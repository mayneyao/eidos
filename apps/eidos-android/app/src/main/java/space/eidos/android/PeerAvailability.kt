package space.eidos.android

import android.os.SystemClock

data class PeerAvailability(
    val reachable: Boolean,
    val spaces: Set<String> = emptySet(),
    val checkedAt: Long = SystemClock.elapsedRealtime(),
) {
    fun fresh() = SystemClock.elapsedRealtime() - checkedAt < 45_000

    fun canSync(space: String) = fresh() && reachable && space in spaces
}

internal fun peerAvailabilityLabel(status: PeerAvailability?, space: String? = null): String =
    when {
        status == null || !status.fresh() -> "正在检测连接…"
        !status.reachable -> "暂不可连接 · 请确认同一 Wi-Fi，且电脑已开启设备同步"
        space != null && space !in status.spaces -> "设备在线 · 此 Space 尚未开放同步"
        space != null -> "在线 · 可以同步"
        else -> "在线 · 可以连接"
    }
