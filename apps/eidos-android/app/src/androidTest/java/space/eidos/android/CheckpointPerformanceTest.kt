package space.eidos.android

import android.database.sqlite.SQLiteDatabase
import android.os.SystemClock
import android.util.Log
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import org.junit.Assert.*
import org.junit.Test

class CheckpointPerformanceTest {
    @Test
    fun smallEditBesideLargeDatabase() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val sizeMiB =
            InstrumentationRegistry.getArguments().getString("checkpointMiB")?.toInt() ?: 64
        require(sizeMiB in 1..1024)
        val root = File(app.cacheDir, "checkpoint-perf-${UUID.randomUUID()}").apply { mkdirs() }
        try {
            SQLiteDatabase.openOrCreateDatabase(File(root, "large.eidos"), null).use { db ->
                db.rawQuery("PRAGMA journal_mode=DELETE", null).use { it.moveToFirst() }
                db.execSQL("CREATE TABLE payload (id INTEGER PRIMARY KEY, body BLOB)")
                db.execSQL(
                    "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<$sizeMiB) " +
                        "INSERT INTO payload SELECT x, randomblob(1048576) FROM n"
                )
            }
            val note = File(root, "note.md").apply { writeText("initial\n") }
            NativeGraft.call(root.path, "checkpoint")
            repeat(3) { iteration ->
                note.writeText("initial\nline $iteration\n")
                val started = SystemClock.elapsedRealtime()
                val saved = NativeGraft.call(root.path, "checkpoint")
                Log.i(
                    "CheckpointPerf",
                    "$sizeMiB MiB unchanged SQLite, one-line edit: ${SystemClock.elapsedRealtime() - started}ms",
                )
                assertFalse(saved.getJSONObject("status").getBoolean("dirty"))
            }
            assertEquals(4, NativeGraft.call(root.path, "history").getJSONArray("commits").length())
            NativeGraft.call(root.path, "checkpoint")
            assertEquals(4, NativeGraft.call(root.path, "history").getJSONArray("commits").length())
        } finally {
            NativeGraft.call(root.path, "close")
            root.deleteRecursively()
        }
    }
}
