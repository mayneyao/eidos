package space.eidos.android

import android.content.Context
import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import org.junit.Assert.*
import org.junit.Test

class PeerSpaceCatalogTest {
    @Test
    fun newDesktopSpaceGetsSeparateNameAndRetryReusesItsDirectory() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val prefix = "peer-catalog-test-${UUID.randomUUID()}-"
        val context =
            object : ContextWrapper(app) {
                override fun getSharedPreferences(name: String, mode: Int) =
                    app.getSharedPreferences(prefix + name, mode)
            }
        try {
            val catalog = SpaceCatalog(context)
            val old = catalog.create("Mac")
            context
                .getSharedPreferences("peer-spaces", Context.MODE_PRIVATE)
                .edit()
                .putString("device:old-history", old.id)
                .commit()
            val fresh = catalog.getOrCreatePeerSpace("device", "new-history", "Mac")
            assertNotEquals(old.id, fresh.id)
            assertEquals("Mac (2)", fresh.name)
            assertEquals(old, catalog.getOrCreatePeerSpace("device", "old-history", "Mac"))
            assertEquals(
                fresh,
                SpaceCatalog(context).getOrCreatePeerSpace("device", "new-history", "Renamed Mac"),
            )
            val another = catalog.getOrCreatePeerSpace("device", "another-history", "Mac")
            assertEquals("Mac (3)", another.name)
            assertFalse(catalog.spaces().any { it.id == fresh.id })
            assertFalse(catalog.peerLocalSpaces().any { it.id == fresh.id })
            catalog.completePeerSpace("device", "new-history", fresh)
            catalog.completePeerSpace("device", "another-history", another)
            assertNull(catalog.peerLocalSpaces().first { it.id == fresh.id }.lastSynced)
            catalog.recordPeerSync(fresh.id)
            assertNotNull(SpaceCatalog(context).peerLocalSpaces().first { it.id == fresh.id }.lastSynced)
            assertEquals(4, catalog.spaces().size)
            catalog.select(old.id)
            catalog.removeLocal(fresh.id)
            assertFalse(SpaceCatalog(context).spaces().any { it.id == fresh.id })
            assertFalse(catalog.peerLocalSpaces().any { it.id == fresh.id })
            assertNotEquals(fresh.id, catalog.getOrCreatePeerSpace("device", "new-history", "Mac").id)
            catalog.removeLocal("personal")
            assertFalse(SpaceCatalog(context).spaces().any { it.id == "personal" })
            assertEquals(old.id, catalog.activeId())
        } finally {
            app.deleteSharedPreferences(prefix + "space-catalog")
            app.deleteSharedPreferences(prefix + "peer-spaces")
            app.deleteSharedPreferences(prefix + "peer-sync-times")
            app.deleteSharedPreferences(prefix + "peer-downloads")
        }
    }
}
