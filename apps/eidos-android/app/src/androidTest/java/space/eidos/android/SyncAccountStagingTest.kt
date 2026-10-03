package space.eidos.android

import android.content.ContextWrapper
import android.net.Uri
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Opt-in staging test; the host supplies a consented callback, never a password. */
class SyncAccountStagingTest {
    @Test
    fun nativeStagingLogin() {
        val phase = InstrumentationRegistry.getArguments().getString("accountPhase")
        assumeTrue(phase in listOf("prepare", "finish"))
        val base = InstrumentationRegistry.getInstrumentation().targetContext
        val context =
            object : ContextWrapper(base) {
                override fun getSharedPreferences(name: String, mode: Int) =
                    super.getSharedPreferences("staging-smoke-$name", mode)
            }
        val account = SyncAccount(context)
        val request = File(base.cacheDir, "staging-account-request.txt")
        val callback = File(base.cacheDir, "staging-account-callback.txt")
        if (phase == "prepare") {
            account.signOut()
            request.writeText(account.beginLogin().toString())
        } else {
            try {
                account.finishLogin(Uri.parse(callback.readText()))
                assertNotNull(account.view())
                account.repositories()
                val marker = account.credential()
                assertTrue(marker.startsWith("account:"))
                if (InstrumentationRegistry.getArguments().getString("publishCloud") == "true") {
                    publishFixtures(context, account)
                }
                if (InstrumentationRegistry.getArguments().getString("cloneCloud") == "true") {
                    val remote =
                        account.provision(
                            "android-native-smoke-${java.util.UUID.randomUUID()}",
                            "Android native staging test",
                        )
                    val sourceId = "staging-source-${java.util.UUID.randomUUID()}"
                    val source = SpaceRepository(context, sourceId)
                    val cloneId = "staging-clone-${java.util.UUID.randomUUID()}"
                    val repository = SpaceRepository(context, cloneId)
                    kotlinx.coroutines.runBlocking {
                        try {
                            source.connectRemote(remote, marker)
                            File(context.filesDir, "spaces/$sourceId/native-staging.md")
                                .writeText("# Android staging fixture\n")
                            source.syncRemote(publish = true)
                            val result = repository.cloneRemote(remote, marker)
                            assertTrue(result.initialized)
                            assertEquals(
                                "# Android staging fixture\n",
                                File(context.filesDir, "spaces/$cloneId/native-staging.md")
                                    .readText(),
                            )
                        } finally {
                            repository.discardPendingClone()
                            source.discardPendingClone()
                        }
                    }
                }
            } finally {
                account.signOut()
                request.delete()
                callback.delete()
            }
        }
    }

    private fun publishFixtures(context: android.content.Context, account: SyncAccount) =
        kotlinx.coroutines.runBlocking {
            check(BuildConfig.DEBUG)
            val session = account.publishSession()
            val id = "publish-smoke-${java.util.UUID.randomUUID()}"
            val repository = SpaceRepository(context, id)
            val root = File(context.filesDir, "spaces/$id")
            val bindings = mutableListOf<Pair<SpaceFile, PublicationBinding>>()
            try {
                val path = repository.create("", "native-publish", "markdown")
                File(root, "attachment.txt").writeText("Android fixture attachment")
                File(root, path)
                    .writeText("# Native Android Publish\n\n[Attachment](attachment.txt)\n")
                val file = SpaceFile(path, "native-publish.md", false, 0, File(root, path).length())
                val events = java.util.concurrent.CopyOnWriteArrayList<org.json.JSONObject>()
                var binding =
                    repository.publishFile(
                        file,
                        session,
                        "$id/note",
                        "public",
                        "",
                        null,
                        false,
                        events::add,
                    )
                bindings.add(file to binding)
                assertTrue(binding.active)
                assertTrue(binding.url.startsWith("https://"))
                assertTrue(events.isNotEmpty())
                val initialId = binding.id
                File(root, path).appendText("\nUpdated on Android.\n")
                binding =
                    repository.publishFile(
                        file,
                        session,
                        binding.slug,
                        "public",
                        "",
                        binding,
                        false,
                        {},
                    )
                assertEquals(initialId, binding.id)
                assertEquals(binding, PublicationStore(context, id, session.subject).load(path))
                val served = java.net.URL(binding.url).readText()
                assertTrue(served.contains("Updated on Android"))
                if (session.privateAccess) {
                    binding =
                        repository.publishFile(
                            file,
                            session,
                            binding.slug,
                            "password",
                            "fixture-password-123",
                            binding,
                            false,
                            {},
                        )
                    assertEquals("password", binding.access)
                    binding =
                        repository.publishFile(
                            file,
                            session,
                            binding.slug,
                            "private",
                            "",
                            binding,
                            false,
                            {},
                        )
                    assertEquals("private", binding.access)
                }
                if (session.plan != "free") {
                    val eidos = repository.create("", "native-data", "eidos")
                    val data =
                        SpaceFile(eidos, "native-data.eidos", false, 0, File(root, eidos).length())
                    val published =
                        repository.publishFile(
                            data,
                            session,
                            "$id/data",
                            "public",
                            "",
                            null,
                            false,
                            {},
                        )
                    bindings.add(data to published)
                    assertTrue(published.active)
                }
            } finally {
                try {
                    for ((file, saved) in bindings) {
                        val latest =
                            PublicationStore(context, id, session.subject).load(file.path) ?: saved
                        val removed =
                            repository.publishFile(
                                file,
                                session,
                                latest.slug,
                                "unchanged",
                                "",
                                latest,
                                true,
                                {},
                            )
                        assertFalse(removed.active)
                        assertTrue(File(root, file.path).exists())
                    }
                } finally {
                    repository.close()
                    root.deleteRecursively()
                }
            }
        }
}
