package space.eidos.android

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SyncConnectionDeviceTest {
    private val context
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun encryptedProfilesSurviveRecreationAndAreBoundToTheirSpace() {
        val id = "vault-${UUID.randomUUID()}"
        val other = "$id-other"
        val store = SyncProfileStore(context, id)
        val second = SyncProfileStore(context, other)
        val preferences = context.getSharedPreferences("sync-profiles", Context.MODE_PRIVATE)
        try {
            val profile = store.validate("https://example.test/team/space", "sensitive-test-token")
            store.save(profile)
            assertEquals(profile, SyncProfileStore(context, id).load())
            val encrypted = checkNotNull(preferences.getString("profile.$id", null))
            assertFalse(encrypted.contains(profile.token))
            assertFalse(profile.toString().contains(profile.token))
            preferences.edit().putString("profile.$other", encrypted).commit()
            assertTrue(runCatching { second.load() }.isFailure)
            for (url in
                listOf(
                    "http://example.test/team/space",
                    "https://user:secret@example.test/team/space",
                    "https://example.test/team/space?token=secret",
                )) {
                assertTrue(runCatching { store.validate(url, "") }.isFailure)
            }
            store.clear()
            assertNull(SyncProfileStore(context, id).load())
        } finally {
            store.clear()
            second.clear()
        }
    }

    @Test
    fun repositoryConnectionRestoresCredentialsAndSyncsBothDirections() = runBlocking {
        val base = InstrumentationRegistry.getArguments().getString("graftRemoteUrl")
        Assume.assumeNotNull(base)
        val url = "$base/android/profile-${UUID.randomUUID()}"
        val id = "connection-${UUID.randomUUID()}"
        val receiverId = "receiver-${UUID.randomUUID()}"
        val root = File(context.filesDir, "spaces/$id")
        val peer = File(context.cacheDir, "peer-${UUID.randomUUID()}").apply { mkdirs() }
        val repository = SpaceRepository(context, id)
        try {
            val path = repository.create("", "笔记", "markdown")
            repository.saveText(repository.readText(path).copy(text = "# 手机\n"))
            repository.connectRemote(url, "ephemeral-test-token")
            assertEquals(url, repository.graftStatus().remoteUrl)
            assertEquals("synced", repository.syncRemote(publish = true))
            val connection =
                JSONObject().put("url", "graft+$url").put("token", "ephemeral-test-token")
            NativeGraft.call(peer.path, "clone", connection)
            assertEquals("# 手机\n", File(peer, path).readText())
            File(peer, path).writeText("# 电脑\n")
            NativeGraft.call(peer.path, "checkpoint")
            NativeGraft.call(peer.path, "push")
            // Switching native sessions discards its in-memory credentials.
            // The recreated repository must decrypt and reapply its own token.
            val reopened = SpaceRepository(context, id)
            assertEquals("synced", reopened.syncRemote())
            assertEquals("# 电脑\n", reopened.readText(path).text)
            val receiver = SpaceRepository(context, receiverId)
            receiver.connectRemote(url, "ephemeral-test-token")
            assertEquals("synced", receiver.syncRemote())
            assertEquals("# 电脑\n", receiver.readText(path).text)
            reopened.disconnectRemote()
            assertNull(SpaceRepository(context, id).graftStatus().remoteUrl)
            assertTrue(runCatching { reopened.syncRemote() }.isFailure)
            assertEquals("# 电脑\n", reopened.readText(path).text)
        } finally {
            SyncProfileStore(context, id).clear()
            SyncProfileStore(context, receiverId).clear()
            val receiverRoot = File(context.filesDir, "spaces/$receiverId")
            if (receiverRoot.exists()) NativeGraft.call(receiverRoot.path, "close")
            NativeGraft.call(root.path, "close")
            NativeGraft.call(peer.path, "close")
            root.deleteRecursively()
            peer.deleteRecursively()
            receiverRoot.deleteRecursively()
        }
    }
}
