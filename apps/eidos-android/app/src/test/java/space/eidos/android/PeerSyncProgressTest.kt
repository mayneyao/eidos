package space.eidos.android

import org.junit.Assert.*
import org.junit.Test

class PeerSyncProgressTest {
    @Test
    fun onlyPlannedDownloadShowsPercentage() {
        val progress = PeerSyncProgress(startedAt = 0, stage = "获取清单", downloadBytes = 20,
            downloadTotal = 100, downloadPlanned = false)
        assertNull(progress.transferFraction())
        assertNull(progress.copy(stage = "下载数据").transferFraction())
        assertEquals(0.2f, progress.copy(stage = "下载数据", downloadPlanned = true).transferFraction())
        assertNull(progress.copy(stage = "写入文件", downloadPlanned = true).transferFraction())
        assertNull(progress.copy(stage = "下载数据", downloadPlanned = true, downloadTotal = 0).transferFraction())
    }

    @Test
    fun lateTransferPollCannotRegressFileApplication() {
        assertEquals("获取清单", peerDownloadStage("获取清单", false))
        assertEquals("下载数据", peerDownloadStage("获取清单", true))
        assertEquals("写入文件", peerDownloadStage("写入文件", true))
        assertEquals("正在完成下载", peerDownloadStage("正在完成下载", true))
        assertEquals("发送本机版本", peerDownloadStage("发送本机版本", true))
    }
}
