package space.eidos.android

import org.junit.Assert.*
import org.junit.Test

class SyncStatusMessageTest {
    @Test
    fun distinguishesLocalStorageFromObservedSyncCompletion() {
        val state = GraftState(true, false, "https://example.org", "completed")
        assertEquals("上次同步已完成 · 完整保存在本机", homeSyncMessage(state, null, false, false))
        assertTrue(
            homeSyncMessage(state.copy(syncStatus = "pending"), null, false, false)
                .startsWith("待同步")
        )
        assertTrue(
            homeSyncMessage(state.copy(syncStatus = "failed"), null, false, false)
                .startsWith("同步失败")
        )
        assertTrue(homeSyncMessage(state, null, false, true).startsWith("需要合并"))
        assertTrue(homeSyncMessage(state, null, true, false).startsWith("正在同步"))
        assertEquals("本地 Space · 可离线使用", homeSyncMessage(null, null, false, false))
    }
}
