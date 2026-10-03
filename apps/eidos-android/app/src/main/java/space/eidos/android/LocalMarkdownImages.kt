package space.eidos.android

import android.content.Context
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.ImageDecoder
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import io.noties.markwon.image.ImageItem
import io.noties.markwon.image.ImagesPlugin
import io.noties.markwon.image.SchemeHandler
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.roundToInt
import kotlinx.coroutines.runBlocking

private val imageExecutor =
    java.util.concurrent.Executors.newFixedThreadPool(2) { task ->
        Thread(task, "eidos-images").apply { isDaemon = true }
    }

internal class ImageUnavailable(context: Context, val reason: String? = null) : Drawable() {
    private val scale = context.resources.displayMetrics.density
    private val paint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.GRAY
            textSize = 14 * scale
        }

    override fun getIntrinsicWidth() = (140 * scale).roundToInt()

    override fun getIntrinsicHeight() = (40 * scale).roundToInt()

    override fun draw(canvas: Canvas) {
        canvas.drawText("图片不可用", bounds.left + 8 * scale, bounds.top + 26 * scale, paint)
    }

    override fun setAlpha(alpha: Int) {
        paint.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        paint.colorFilter = colorFilter
    }

    @Deprecated("Drawable API") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

internal fun localMarkdownImages(
    context: Context,
    repository: SpaceRepository,
    document: String,
): ImagesPlugin {
    val memory = AtomicLong(0)
    val images = mutableMapOf<String, android.graphics.Bitmap>()
    return ImagesPlugin.create { plugin ->
        plugin.executorService(imageExecutor)
        listOf("file", "http", "https", "data").forEach { plugin.removeSchemeHandler(it) }
        plugin.addSchemeHandler(
            object : SchemeHandler() {
                override fun supportedSchemes() = listOf("eidos-image")

                override fun handle(raw: String, uri: Uri): ImageItem =
                    synchronized(images) {
                        images[raw]?.let {
                            return@synchronized ImageItem.withResult(
                                BitmapDrawable(context.resources, it)
                            )
                        }
                        val bytes = runBlocking {
                            repository.markdownImage(document, uri.schemeSpecificPart)
                        }
                        var reservation = 0L
                        try {
                            val bitmap =
                                ImageDecoder.decodeBitmap(
                                    ImageDecoder.createSource(ByteBuffer.wrap(bytes))
                                ) { decoder, info, _ ->
                                    val ratio =
                                        minOf(
                                            1.0,
                                            2048.0 / maxOf(info.size.width, info.size.height),
                                        )
                                    val width = maxOf(1, (info.size.width * ratio).roundToInt())
                                    val height = maxOf(1, (info.size.height * ratio).roundToInt())
                                    reservation = width.toLong() * height * 4
                                    check(memory.addAndGet(reservation) <= 48L * 1024 * 1024) {
                                        "文档图片超过显示内存限制"
                                    }
                                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                                    decoder.setTargetColorSpace(
                                        android.graphics.ColorSpace.get(
                                            android.graphics.ColorSpace.Named.SRGB
                                        )
                                    )
                                    decoder.setTargetSize(width, height)
                                }
                            val actualBytes = bitmap.allocationByteCount.toLong()
                            val allocated = memory.addAndGet(actualBytes - reservation)
                            reservation = actualBytes
                            if (allocated > 48L * 1024 * 1024) {
                                bitmap.recycle()
                                error("文档图片超过显示内存限制")
                            }
                            images[raw] = bitmap
                            ImageItem.withResult(BitmapDrawable(context.resources, bitmap))
                        } catch (error: Exception) {
                            memory.addAndGet(-reservation)
                            throw error
                        }
                    }
            }
        )
        plugin.errorHandler { _, error -> ImageUnavailable(context, error.message) }
    }
}
