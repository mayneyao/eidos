package space.eidos.android

import org.junit.Assert.assertEquals
import org.junit.Test

class SyncOverviewTest {
    private val completed =
        AppState(graft = GraftState(true, false, "https://example.org", "completed"))

    @Test
    fun completionDoesNotClaimKnowledgeOfCurrentRemoteState() {
        assertEquals("上次同步已完成", syncOverviewTitle(completed))
        assertEquals("正在同步", syncOverviewTitle(completed.copy(syncing = true)))
        assertEquals(
            "等待后台同步",
            syncOverviewTitle(
                completed.copy(backgroundSync = BackgroundSyncState("ENQUEUED", "等待"))
            ),
        )
    }

    @Test
    fun mergeTakesPriorityOverQueuedWorkAndLocalFilesDoNotImplySync() {
        assertEquals(
            "需要合并版本",
            syncOverviewTitle(
                completed.copy(
                    graft = completed.graft!!.copy(syncStatus = "needs_merge"),
                    backgroundSync = BackgroundSyncState("ENQUEUED", "等待"),
                )
            ),
        )
        assertEquals("仅保存在本机", syncOverviewTitle(AppState(graft = GraftState(true, false))))
        assertEquals("正在读取状态", syncOverviewTitle(AppState()))
        assertEquals(
            "同步未完成",
            syncOverviewTitle(completed.copy(graft = completed.graft!!.copy(syncStatus = "failed"))),
        )
        assertEquals(
            "上次同步中断",
            syncOverviewTitle(
                completed.copy(graft = completed.graft!!.copy(syncStatus = "interrupted"))
            ),
        )
    }
}
