import { useEffect, useMemo, useRef, useState } from "react"

interface TimelineProps {
  onTimeSelect: (date: Date) => void
  recordDates: Date[]
  currentDay: Date
}

const Timeline: React.FC<TimelineProps> = ({
  onTimeSelect,
  recordDates,
  currentDay,
}) => {
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null)
  const [height, setHeight] = useState<number>(0)
  const [top, setTop] = useState<number>(0)
  const [right, setRight] = useState<number>(0)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [audioContext] = useState(
    () => new (window.AudioContext || (window as any).webkitAudioContext)()
  )

  // 添加上一次播放时间的引用
  const lastPlayTimeRef = useRef(0)

  // 计算开始和结束日期
  const startDate = useMemo(() => {
    if (recordDates.length === 0) return new Date()
    return new Date(Math.min(...recordDates.map((d) => d.getTime())))
  }, [recordDates])

  const endDate = useMemo(() => new Date(), []) // 总是使用当前时间作为结束时间

  useEffect(() => {
    const updateDimensions = () => {
      const mainContent = document.getElementById("main-content")
      if (mainContent) {
        const rect = mainContent.getBoundingClientRect()
        setHeight(mainContent.offsetHeight)
        setTop(rect.top)
        setRight(window.innerWidth - rect.right)
      }
    }

    const mainContent = document.getElementById("main-content")
    if (mainContent) {
      // 创建 ResizeObserver 实例
      const resizeObserver = new ResizeObserver(updateDimensions)
      // 开始观察 main-content
      resizeObserver.observe(mainContent)

      // 同时保留对窗口 resize 的监听，因为窗口大小变化也会影响位置
      window.addEventListener("resize", updateDimensions)

      return () => {
        resizeObserver.disconnect()
        window.removeEventListener("resize", updateDimensions)
      }
    }
  }, [])

  // 修改时间刻度生成逻辑
  const getTimeMarkers = () => {
    // 按年份对记录进行分组
    const recordsByYear = recordDates.reduce((acc, date) => {
      const year = date.getFullYear()
      if (!acc.has(year)) {
        acc.set(year, {
          dates: [],
          firstDate: date,
          lastDate: date,
        })
      }
      const yearData = acc.get(year)!
      yearData.dates.push(date)
      if (date < yearData.firstDate) yearData.firstDate = date
      if (date > yearData.lastDate) yearData.lastDate = date
      return acc
    }, new Map<number, { dates: Date[]; firstDate: Date; lastDate: Date }>())

    // 计算记录数的对数值
    const logCounts = Array.from(recordsByYear.values()).map((data) =>
      Math.log(data.dates.length + 1)
    )
    const maxLogCount = Math.max(...logCounts)
    const minLogCount = Math.min(...logCounts)

    // 计算每个年份的位置和高度
    return Array.from(recordsByYear.entries())
      .sort((a, b) => b[0] - a[0]) // 按年份降序排序
      .map(([year, data]) => {
        const logCount = Math.log(data.dates.length + 1)
        const heightRatio =
          (logCount - minLogCount) / (maxLogCount - minLogCount)
        const height = 5 + heightRatio * 25 // 高度范围：5% 到 30%

        // 修改：使用年份开始时间而不是年中
        const yearStart = new Date(year, 0, 1).getTime() // 使用年初（1月1日）
        const position =
          100 -
          ((yearStart - startDate.getTime()) /
            (endDate.getTime() - startDate.getTime())) *
            100

        // Add edge snapping logic
        let startPosition = position - height / 2
        let endPosition = position + height / 2

        // Snap to top if close to it
        if (startPosition < 5) {
          startPosition = 0
          endPosition = height
        }
        // Snap to bottom if close to it
        if (endPosition > 95) {
          startPosition = 100 - height
          endPosition = 100
        }

        return {
          year,
          startPosition: Math.max(0, startPosition),
          endPosition: Math.min(100, endPosition),
          weight: data.dates.length / recordDates.length,
          recordCount: data.dates.length,
        }
      })
  }

  // Function to create and play tick sound
  const playTickSound = () => {
    // 确保音效之间至少间隔 50ms
    const now = Date.now()
    if (now - lastPlayTimeRef.current < 50) {
      return
    }
    lastPlayTimeRef.current = now

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(2000, audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(
      1500,
      audioContext.currentTime + 0.05
    )

    gainNode.gain.setValueAtTime(0.05, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.05
    )

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.05)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const percentage = 1 - relativeY / rect.height

    const timeSpan = endDate.getTime() - startDate.getTime()
    const hoveredTime = startDate.getTime() + timeSpan * percentage

    const closestDate = recordDates.reduce((closest, current) => {
      const currentDiff = Math.abs(current.getTime() - hoveredTime)
      const closestDiff = Math.abs(closest.getTime() - hoveredTime)
      return currentDiff < closestDiff ? current : closest
    }, recordDates[0])

    // Play tick sound when hovering over a new date
    if (hoveredDate?.getTime() !== closestDate?.getTime()) {
      // Resume audio context if it's suspended (browser autoplay policy)
      if (audioContext.state === "suspended") {
        audioContext.resume()
      }
      playTickSound()
    }

    setHoveredDate(closestDate)
  }

  return (
    <div
      ref={timelineRef}
      className="fixed py-4 opacity-0 hover:opacity-100 transition-opacity duration-300"
      style={{
        height: height ? `${height}px` : "100%",
        top: `${top}px`,
        right: `${right}px`,
      }}
    >
      <div
        className="relative w-8 h-full mx-2"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredDate(null)}
        onClick={(e) => hoveredDate && onTimeSelect(hoveredDate)}
      >
        {/* 时间轴竖线 */}
        <div className="absolute left-1/2 top-0 w-[2px] h-full bg-gray-200 -translate-x-1/2" />

        {/* 固定时间刻度 */}
        {getTimeMarkers().map((marker) => (
          <div
            key={marker.year}
            className="absolute right-full mr-1 px-1 py-1.5 text-gray-500 text-xs whitespace-nowrap"
            style={{
              top: `${marker.startPosition}%`,
              height: `${marker.endPosition - marker.startPosition}%`,
              display: "flex",
              alignItems: "center",
              opacity: 0.5 + marker.weight * 0.5,
            }}
          >
            {marker.year}
            <span className="ml-1 text-[10px] text-gray-400">
              ({marker.recordCount})
            </span>
          </div>
        ))}

        {/* 悬浮位置刻度线和提示的样式也需要相应调整 */}
        {hoveredDate && (
          <>
            <div
              className="absolute left-0 w-full h-[2px] bg-gray-400"
              style={{
                top: `${
                  100 -
                  ((hoveredDate.getTime() - startDate.getTime()) /
                    (endDate.getTime() - startDate.getTime())) *
                    100
                }%`,
              }}
            />
            <div
              className="absolute right-full mr-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded whitespace-nowrap"
              style={{
                top: `${
                  100 -
                  ((hoveredDate.getTime() - startDate.getTime()) /
                    (endDate.getTime() - startDate.getTime())) *
                    100
                }%`,
              }}
            >
              {hoveredDate.toLocaleDateString()}
            </div>
          </>
        )}

        {/* Add current day indicator */}
        <div
          className="absolute left-0 w-full h-[2px] bg-blue-500"
          style={{
            top: `${
              100 -
              ((currentDay.getTime() - startDate.getTime()) /
                (endDate.getTime() - startDate.getTime())) *
                100
            }%`,
          }}
        />
      </div>
    </div>
  )
}

export default Timeline
