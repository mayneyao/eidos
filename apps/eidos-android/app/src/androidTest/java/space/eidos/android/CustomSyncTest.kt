package space.eidos.android

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Test

class CustomSyncTest {
    private val app get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun customCredentialsPersistEncryptedAndNeverResolveThroughAnAccount() {
        val id = "custom-profile-${UUID.randomUUID()}"
        val store = SyncProfileStore(app, id)
        val profile = SyncProfile("https://custom.example/personal/notes", "account:literal-custom-token", custom = true,
            server = "https://custom.example", uuid = "00010203-0405-4607-8809-0a0b0c0d0e0f", password = "synthetic password")
        try {
            store.save(profile)
            assertEquals(profile, SyncProfileStore(app, id).load())
            assertEquals(profile.token, SyncAccount(app).resolve(profile))
            val raw = app.getSharedPreferences("sync-profiles", 0).getString("profile.$id", "")!!
            assertFalse(raw.contains(profile.token)); assertFalse(raw.contains(profile.password!!)); assertFalse(raw.contains("custom.example"))
            SyncAccount(app).signOut()
            assertEquals(profile, store.load())
        } finally { store.clear() }
    }

    @Test fun selfHostedEncryptedRoundtripNeedsNoEidosAccount(): Unit = runBlocking {
        val origin = InstrumentationRegistry.getArguments().getString("customSyncOrigin")
        Assume.assumeNotNull(origin)
        val token = "mobile-custom-sync-synthetic-token-00000000"
        val client = CustomSyncClient(checkNotNull(origin), token)
        val remote = client.provision("Android custom", UUID.randomUUID().toString())
        assertTrue(client.repositories().any { it.url == remote.url && it.uuid == remote.uuid })
        val sourceId = "custom-source-${UUID.randomUUID()}"
        val source = SpaceRepository(app, sourceId)
        val profile = SyncProfile(remote.url, token, custom = true, server = client.origin, uuid = remote.uuid, password = "Android synthetic sync password")
        var cloned: LocalSpace? = null
        try {
            val path = source.create("", "note", "markdown")
            source.saveText(source.readText(path).copy(text = "Android original"))
            source.connectEncrypted(profile, initialize = true)
            assertEquals(profile, SyncProfileStore(app, sourceId).load())
            cloned = CloneJournal(app).download("Android downloaded", profile.url, token, encrypted = profile)
            val target = SpaceRepository(app, cloned.id)
            assertEquals("Android original", target.readText(path).text)
            target.saveText(target.readText(path).copy(text = "Android phone change"))
            assertEquals("synced", target.syncRemote())
            source.syncRemote()
            assertEquals("Android phone change", source.readText(path).text)
            target.close()
            val reopened = SpaceRepository(app, cloned.id)
            assertEquals("synced", reopened.syncRemote())
            for (invalid in listOf(profile.copy(password = "wrong-password"), profile.copy(token = "wrong-token"), profile.copy(uuid = "11111111-1111-4111-8111-111111111111"))) {
                assertTrue(runCatching { reopened.connectEncrypted(invalid, initialize = false) }.isFailure)
                assertEquals(profile, SyncProfileStore(app, cloned.id).load())
                assertEquals("Android phone change", reopened.readText(path).text)
            }
            reopened.disconnectRemote()
            assertNull(SyncProfileStore(app, cloned.id).load())
            assertEquals("Android phone change", reopened.readText(path).text)
            reopened.close()
        } finally {
            source.close()
            File(app.filesDir, "spaces/$sourceId").deleteRecursively()
            SyncProfileStore(app, sourceId).clear()
            SyncProfileStore(app, "custom-pending-$sourceId").clear()
            cloned?.let { SpaceRepository(app, it.id).deleteLocalSpace() }
        }
    }

    @Test fun directHttpRepositoryRoundtripAndExplicitDisconnectKeepLocalFiles(): Unit = runBlocking {
        val origin = InstrumentationRegistry.getArguments().getString("customSyncOrigin")
        Assume.assumeNotNull(origin)
        val token = "mobile-custom-sync-synthetic-token-00000000"
        val id = "custom-http-${UUID.randomUUID()}"
        val source = SpaceRepository(app, id)
        val url = "$origin/personal/raw"
        var clone: LocalSpace? = null
        try {
            val path = source.create("", "plain", "markdown")
            source.saveText(source.readText(path).copy(text = "plain HTTP content"))
            source.connectCustomRemote(url, token)
            source.syncRemote(publish = true)
            clone = CloneJournal(app).download("Plain HTTP", url, token, custom = true)
            val phone = SpaceRepository(app, clone.id)
            assertEquals("plain HTTP content", phone.readText(path).text)
            assertTrue(runCatching { phone.connectCustomRemote("$origin/personal/other", token) }.isFailure)
            assertEquals(url, phone.graftStatus().remoteUrl)
            phone.disconnectRemote()
            phone.connectCustomRemote("$origin/personal/other", token)
            assertEquals("$origin/personal/other", phone.graftStatus().remoteUrl)
            assertEquals("plain HTTP content", phone.readText(path).text)
            phone.close()
        } finally {
            source.close(); SyncProfileStore(app, id).clear()
            File(app.filesDir, "spaces/$id").deleteRecursively()
            clone?.let { SpaceRepository(app, it.id).deleteLocalSpace() }
        }
    }
}
