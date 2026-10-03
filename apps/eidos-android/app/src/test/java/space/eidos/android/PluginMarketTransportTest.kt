package space.eidos.android

import java.io.ByteArrayOutputStream
import java.util.zip.GZIPOutputStream
import org.junit.Assert.*
import org.junit.Test

class PluginMarketTransportTest {
    @Test
    fun downloadRedirectTargetsMustStayOnTrustedHttpsHosts() {
        assertTrue(
            PluginMarketTransport.trusted(
                "https://github.com/eidos-space/plugin/releases/download/v1/a.eidos-plugin"
            )
        )
        assertTrue(
            PluginMarketTransport.trusted(
                "https://release-assets.githubusercontent.com/file?token=test"
            )
        )
        for (url in
            listOf(
                "http://github.com/file",
                "https://github.com.evil.test/file",
                "https://github.com@evil.test/file",
                "https://github.com:8443/file",
                "https://user@github.com/file",
                "https://github.com/file#fragment",
                "file:///tmp/plugin",
            )) assertFalse(url, PluginMarketTransport.trusted(url))
    }

    @Test
    fun boundsUnknownLengthStreamsAndDecompressedPackages() {
        assertArrayEquals(
            byteArrayOf(1, 2),
            PluginMarketTransport.bounded(byteArrayOf(1, 2).inputStream(), 2),
        )
        assertThrows(IllegalArgumentException::class.java) {
            PluginMarketTransport.bounded(ByteArray(3).inputStream(), 2)
        }
        val archive = ByteArrayOutputStream()
        GZIPOutputStream(archive).use {
            it.write(ByteArray(PluginMarketTransport.packageLimit + 1))
        }
        assertThrows(IllegalArgumentException::class.java) {
            PluginMarketTransport.unpack(archive.toByteArray())
        }
    }

    @Test
    fun rejectsMalformedArchivesAndUtf8AndHashesExactBytes() {
        assertThrows(java.io.IOException::class.java) {
            PluginMarketTransport.unpack("not gzip".toByteArray())
        }
        val archive = ByteArrayOutputStream()
        GZIPOutputStream(archive).use { it.write(byteArrayOf(0xc0.toByte(), 0x80.toByte())) }
        assertThrows(java.nio.charset.CharacterCodingException::class.java) {
            PluginMarketTransport.unpack(archive.toByteArray())
        }
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            PluginMarketTransport.hash("abc".toByteArray()),
        )
    }
}
