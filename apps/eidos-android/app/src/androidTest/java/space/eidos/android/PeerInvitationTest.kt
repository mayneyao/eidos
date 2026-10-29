package space.eidos.android

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PeerInvitationTest {
    private fun payload() = JSONObject().put("version", 1).put("url", "https://192.168.1.20:4567")
        .put("fingerprint", "a".repeat(64)).put("ticket", "b".repeat(43))
        .put("space", "device").put("name", "Computer")
    private fun parse(value: JSONObject) = PeerInvitation.parse("eidos-peer:" + Base64.encodeToString(
        value.toString().toByteArray(), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
    ))

    @Test fun legacyCodeAndDeduplicatedCandidates() {
        val legacy = parse(payload())
        assertEquals(listOf(legacy.url), legacy.urls)
        val current = parse(payload().put("urls", JSONArray(listOf(legacy.url, "https://10.0.0.2:4567"))))
        assertEquals(listOf(legacy.url, "https://10.0.0.2:4567"), current.urls)
    }

    @Test fun rejectsMalformedOrOversizedAlternatives() {
        for (url in listOf("http://192.168.1.20:4567", "https://user@192.168.1.20:4567", "https://192.168.1.20:4567/path", "https://192.168.1.20:4567?query", "https://192.168.1.20:4567#fragment")) {
            assertThrows(Exception::class.java) { parse(payload().put("urls", JSONArray(listOf(url)))) }
        }
        assertThrows(Exception::class.java) { parse(payload().put("urls", JSONArray(List(9) { "https://10.0.0.1:4567" }))) }
        assertThrows(Exception::class.java) { parse(payload().put("urls", "not an array")) }
    }
}
