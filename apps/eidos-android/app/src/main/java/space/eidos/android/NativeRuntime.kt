package space.eidos.android

import org.json.JSONObject

/** Blocking API: call on the Space repository's serialized IO boundary. */
object NativeRuntime {
    init {
        System.loadLibrary("eidos_android_host")
    }

    @JvmStatic external fun execute(path: String, method: String, request: String): String

    fun close() {
        val envelope = JSONObject(execute("", "close", "{}"))
        check(envelope.optBoolean("ok")) { envelope.optString("error", "无法关闭数据连接") }
    }

    fun call(path: String, method: String, request: JSONObject = JSONObject()): JSONObject {
        val envelope = JSONObject(execute(path, method, request.toString()))
        check(envelope.optBoolean("ok")) { envelope.optString("error", "数据操作失败") }
        return envelope.getJSONObject("value")
    }
}
