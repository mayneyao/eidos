package space.eidos.android

import org.junit.Assert.*
import org.junit.Test

class PluginResourcePolicyTest {
    private val policy =
        PluginResourcePolicy(
            "https://plugin.invalid/session/file",
            setOf("https://tiles.openfreemap.org"),
        )

    @Test
    fun servesOnlyTheSessionMainDocument() {
        assertTrue(policy.isPageRead("https://plugin.invalid/session/index.html", "GET", true))
        assertFalse(policy.isPageRead(policy.pageUrl, "GET", false))
        assertFalse(policy.isPageRead(policy.pageUrl, "POST", true))
        assertFalse(policy.isPageRead("https://plugin.invalid/other/index.html", "GET", true))
        assertFalse(policy.isPageRead("data:text/html;charset=utf-8;base64,", "GET", true))
        assertFalse(policy.isBoundRead(policy.pageUrl, "GET"))
    }

    @Test
    fun matchesOnlyTheExactSessionEndpoint() {
        assertTrue(policy.isBoundRead("https://plugin.invalid/session/file", "GET"))
        assertFalse(policy.isBoundRead("https://plugin.invalid/other/file", "GET"))
        assertFalse(policy.isBoundRead("https://plugin.invalid/session/file?path=secret", "GET"))
        assertFalse(policy.isBoundRead("https://plugin.invalid/session/file", "POST"))
    }

    @Test
    fun restrictsMapResourcesToTheDeclaredHttpsOrigin() {
        assertTrue(policy.allowsNetwork("https://tiles.openfreemap.org/planet", "GET"))
        for (url in
            listOf(
                "http://tiles.openfreemap.org/planet",
                "https://tiles.openfreemap.org.evil.test/",
                "https://tiles.openfreemap.org@evil.test/",
                "https://tiles.openfreemap.org:8443/",
                "file:///etc/passwd",
                "content://files/1",
            )) {
            assertFalse(policy.allowsNetwork(url, "GET"))
        }
        assertFalse(policy.allowsNetwork("https://tiles.openfreemap.org/planet", "POST"))
    }

    @Test
    fun rejectsOriginsThatCannotBeInsertedIntoCsp() {
        assertTrue(PluginResourcePolicy.validOrigin("https://tiles.openfreemap.org"))
        for (origin in
            listOf(
                "https://example.com/path",
                "https://*.example.com",
                "https://user@example.com",
                "https://example.com?q=a",
                "https://example.com#fragment",
                "https://example.com; script-src *",
                "https://example.com\"",
            )) {
            assertFalse(PluginResourcePolicy.validOrigin(origin))
        }
    }
}
