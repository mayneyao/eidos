package space.eidos.android

import android.content.Context
import android.content.pm.ApplicationInfo
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.net.URI
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

data class SyncProfile(val url: String, val token: String) {
    override fun toString() = "SyncProfile(credentials redacted)"
}

/** Credentials stay in app storage, encrypted with a non-exportable Android key. */
class SyncProfileStore(private val context: Context, spaceId: String) {
    private val preferences = context.getSharedPreferences("sync-profiles", Context.MODE_PRIVATE)
    private val entry = "profile.$spaceId"
    private val alias = "eidos.sync.profiles.v1"

    private fun key(): SecretKey =
        synchronized(keyLock) {
            val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            (store.getKey(alias, null) as? SecretKey)?.let {
                return@synchronized it
            }
            check(!store.containsAlias(alias)) { "同步加密密钥不可用，请重新配置连接" }
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                .apply {
                    init(
                        KeyGenParameterSpec.Builder(
                                alias,
                                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                            )
                            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                            .build()
                    )
                }
                .generateKey()
        }

    companion object {
        private val keyLock = Any()
    }

    fun validate(url: String, token: String): SyncProfile {
        val clean = url.trim().removeSuffix("/")
        val uri =
            runCatching { URI(clean) }.getOrElse { throw IllegalArgumentException("请输入有效的远程地址") }
        val debugLoopback =
            (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0 &&
                uri.host == "127.0.0.1"
        require(uri.scheme == "https" || (uri.scheme == "http" && debugLoopback)) {
            "请输入 HTTPS 远程地址"
        }
        require(
            !uri.host.isNullOrBlank() &&
                uri.rawUserInfo == null &&
                uri.rawQuery == null &&
                uri.rawFragment == null &&
                (uri.port == -1 || uri.port in 1..65535)
        ) {
            "地址不能包含凭证、查询参数或片段"
        }
        require(token.none { it == '\r' || it == '\n' }) { "访问令牌不能包含换行" }
        return SyncProfile(clean, token.trim())
    }

    fun save(profile: SyncProfile) {
        val cipher =
            Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        cipher.updateAAD(entry.toByteArray(Charsets.UTF_8))
        val value =
            JSONObject()
                .put("url", profile.url)
                .put("token", profile.token)
                .toString()
                .toByteArray(Charsets.UTF_8)
        val encrypted =
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP) +
                "." +
                Base64.encodeToString(cipher.doFinal(value), Base64.NO_WRAP)
        check(preferences.edit().putString(entry, encrypted).commit()) { "无法保存连接配置" }
    }

    fun load(): SyncProfile? {
        val value = preferences.getString(entry, null) ?: return null
        val parts = value.split('.')
        check(parts.size == 2) { "连接配置已损坏，请重新连接" }
        val cipher =
            Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(
                    Cipher.DECRYPT_MODE,
                    key(),
                    GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)),
                )
            }
        cipher.updateAAD(entry.toByteArray(Charsets.UTF_8))
        val data =
            JSONObject(
                String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
            )
        return SyncProfile(data.getString("url"), data.getString("token"))
    }

    fun clear() {
        check(preferences.edit().remove(entry).commit()) { "无法清除连接配置" }
    }
}
