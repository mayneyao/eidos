package space.eidos.android

import android.content.ContextWrapper
import android.net.Uri
import android.util.Base64
import androidx.test.platform.app.InstrumentationRegistry
import java.security.MessageDigest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SyncAccountTest {
    private class Fixture {
        val prefix = "account-test-${java.util.UUID.randomUUID()}-"
        val context =
            object : ContextWrapper(InstrumentationRegistry.getInstrumentation().targetContext) {
                override fun getSharedPreferences(name: String, mode: Int) =
                    super.getSharedPreferences(prefix + name, mode)
            }
        var subject = "alice"
        var refreshes = 0
        var tokenRequests = 0
        var challenge = ""
        var verifier = ""
        var token = "access-initial"
        val registered = mutableListOf<String>()
        val account =
            SyncAccount(context) { url, _, body, bearer, _ ->
                when {
                    url.endsWith("openid-configuration") ->
                        JSONObject()
                            .put("issuer", SyncEnvironment.account)
                            .put(
                                "authorization_endpoint",
                                SyncEnvironment.account + "/api/auth/oauth2/authorize",
                            )
                            .put(
                                "token_endpoint",
                                SyncEnvironment.account + "/api/auth/oauth2/token",
                            )
                            .put(
                                "code_challenge_methods_supported",
                                org.json.JSONArray().put("S256"),
                            )
                    url.endsWith("oauth2/token") -> {
                        tokenRequests++
                        val values = Uri.parse("https://test/?$body")
                        assertEquals(SyncEnvironment.client, values.getQueryParameter("client_id"))
                        if (values.getQueryParameter("grant_type") == "refresh_token") {
                            assertEquals(
                                "refresh-initial",
                                values.getQueryParameter("refresh_token"),
                            )
                            refreshes++
                            token = "access-refreshed"
                        } else verifier = values.getQueryParameter("code_verifier")!!
                        JSONObject()
                            .put("access_token", token)
                            .put(
                                "refresh_token",
                                if (refreshes == 0) "refresh-initial" else "refresh-rotated",
                            )
                            .put("token_type", "Bearer")
                            .put("expires_in", if (refreshes == 0) 1 else 3600)
                    }
                    url.endsWith("oauth2/userinfo") ->
                        JSONObject().put("sub", subject).put("email", "$subject@example.com")
                    url.endsWith("/api/publish/userinfo") ->
                        JSONObject()
                            .put("sub", subject)
                            .put(
                                "publish_access",
                                JSONObject()
                                    .put("state", "active")
                                    .put("plan", "free")
                                    .put("privatePublications", false),
                            )
                    url == SyncEnvironment.publish + "/api/tenant" ->
                        JSONObject()
                            .put("canonicalHost", "fixture-staging.eidos.ink")
                            .put("publications", org.json.JSONArray())
                    url.endsWith("devices/register") -> {
                        registered.add(bearer!!)
                        JSONObject()
                    }
                    url.endsWith("/.well-known/graft") ->
                        JSONObject()
                            .put("service", "eidos-graft-remote")
                            .put("version", 1)
                            .put(
                                "remote_url_template",
                                SyncEnvironment.remote + "/{namespace}/{repository}",
                            )
                            .put(
                                "authentication",
                                JSONObject().put("authority", SyncEnvironment.account),
                            )
                    url.endsWith("/api/graft/repositories") ->
                        JSONObject()
                            .put(
                                "repositories",
                                org.json
                                    .JSONArray()
                                    .put(
                                        JSONObject()
                                            .put("name", "notes")
                                            .put("display_name", "Notes")
                                            .put(
                                                "remote_url",
                                                SyncEnvironment.remote + "/u-alice/notes",
                                            )
                                    ),
                            )
                    else -> error("Unexpected request")
                }
            }

        fun begin(): Uri {
            val request = account.beginLogin()
            challenge = request.getQueryParameter("code_challenge")!!
            return Uri.parse(SyncEnvironment.redirect)
                .buildUpon()
                .appendQueryParameter("state", request.getQueryParameter("state"))
                .appendQueryParameter("code", "test-code")
                .build()
        }
    }

    @Test
    fun publishLoginAndTokenRefreshDoNotRequireSyncRegistration() {
        val f = Fixture()
        f.account.finishLogin(f.begin(), registerSync = false)
        val session = f.account.publishSession()
        assertEquals("alice", session.subject)
        assertEquals("free", session.plan)
        assertEquals("access-refreshed", session.token)
        assertEquals(1, f.refreshes)
        assertTrue(f.registered.isEmpty())
        f.account.signOut()
    }

    @Test
    fun loginRefreshAndLogoutKeepCredentialsOutOfSpaceProfiles() {
        val f = Fixture()
        f.account.finishLogin(f.begin())
        assertEquals("alice", f.account.view()!!.subject)
        assertEquals(
            f.challenge,
            Base64.encodeToString(
                MessageDigest.getInstance("SHA-256").digest(f.verifier.toByteArray()),
                Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP,
            ),
        )
        val profile = SyncProfile(SyncEnvironment.remote + "/u-alice/notes", f.account.credential())
        assertFalse(profile.token.contains("access"))
        assertEquals("access-refreshed", f.account.resolve(profile))
        assertEquals(1, f.refreshes)
        assertEquals(listOf("access-initial", "access-refreshed"), f.registered)
        assertEquals("Notes", f.account.repositories().single().name)
        f.account.signOut()
        assertNull(f.account.view())
        assertTrue(runCatching { f.account.resolve(profile) }.isFailure)
    }

    @Test
    fun stateReplayAndForeignRemoteAreRejected() {
        val f = Fixture()
        val callback = f.begin()
        assertTrue(
            runCatching {
                    f.account.finishLogin(
                        Uri.parse(SyncEnvironment.redirect + "?state=wrong&code=bad")
                    )
                }
                .isFailure
        )
        assertEquals(0, f.tokenRequests)
        f.account.finishLogin(callback)
        assertTrue(runCatching { f.account.finishLogin(callback) }.isFailure)
        val credential = f.account.credential()
        for (url in
            listOf(
                "https://evil.example/u/notes",
                "https://sync.eidos.space/u/notes",
                SyncEnvironment.remote + "/u/notes?redirect=evil",
            )) {
            assertTrue(runCatching { f.account.resolve(SyncProfile(url, credential)) }.isFailure)
        }
        assertEquals(1, f.tokenRequests)
        assertTrue(
            runCatching {
                    f.account.resolve(
                        SyncProfile(SyncEnvironment.remote + "/u/notes", "account:bob")
                    )
                }
                .isFailure
        )
        f.account.signOut()
    }

    @Test
    fun pendingLoginSurvivesAccountInstanceRecreation() {
        val f = Fixture()
        val callback = f.begin()
        val stored = SyncProfileStore(f.context, "login.${SyncEnvironment.client}").load()!!
        assertEquals(
            callback.getQueryParameter("state"),
            JSONObject(stored.token).getString("state"),
        )
        assertFalse(
            f.context.getSharedPreferences("sync-profiles", 0).all.values.any {
                it.toString().contains("verifier")
            }
        )
        f.account.finishLogin(callback)
        assertEquals("alice", SyncAccount(f.context).view()!!.subject)
        f.account.signOut()
    }
}
