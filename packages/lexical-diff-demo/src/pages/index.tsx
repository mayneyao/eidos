"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { SerializedEditorState, SerializedLexicalNode } from "lexical"
import {
  markdown2lexical,
  lexical2markdown,
  reconcileState,
  getReconciliationStats,
} from "@eidos.space/lexical"
import { MarkdownEditor } from "../components/markdown-editor"
import { LexicalEditor } from "../components/lexical-editor"

// 复制 JSON State 按钮组件
function CopyStateButton({ state }: { state: SerializedEditorState | null }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!state) return
    try {
      const json = JSON.stringify(state, null, 2)
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Copy failed:", err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      disabled={!state}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        copied
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {copied ? "✓ 已复制" : "📋 复制 JSON"}
    </button>
  )
}

// 重置按钮组件
function ResetButton({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false)

  const handleClick = () => {
    if (confirming) {
      onReset()
    } else {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 2000)
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        confirming
          ? "bg-red-100 text-red-700 animate-pulse"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {confirming ? "⚠️ 确认重置?" : "🔄 重置"}
    </button>
  )
}

// 格式化字节大小
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}

// 对比两条状态
function compareStates(
  oldState: SerializedEditorState | null,
  newState: SerializedEditorState | null
) {
  if (!oldState || !newState)
    return { changed: false, added: [], removed: [], modified: [] }

  const oldNodes = collectNodesWithPid(oldState.root)
  const newNodes = collectNodesWithPid(newState.root)

  const oldPidMap = new Map(oldNodes.map((n) => [n.pid, n]))
  const newPidMap = new Map(newNodes.map((n) => [n.pid, n]))

  const added = newNodes.filter((n) => !oldPidMap.has(n.pid))
  const removed = oldNodes.filter((n) => !newPidMap.has(n.pid))
  const modified = newNodes.filter((n) => {
    const oldNode = oldPidMap.get(n.pid)
    return oldNode && (oldNode.path !== n.path || oldNode.content !== n.content)
  })

  return {
    changed: added.length > 0 || removed.length > 0 || modified.length > 0,
    added,
    removed,
    modified,
  }
}

// 收集所有节点路径
function collectAllPaths(
  node: any,
  path: string = "root",
  paths: string[] = []
): string[] {
  paths.push(path)
  if (node.children) {
    node.children.forEach((child: any, index: number) => {
      collectAllPaths(child, `${path}-${index}`, paths)
    })
  }
  return paths
}

// 收集所有节点及其 PID
type NodeInfo = { path: string; type: string; pid?: string; content: string }

function collectNodesWithPid(
  node: any,
  path: string = "root",
  result: NodeInfo[] = []
): NodeInfo[] {
  const getContent = (n: any): string => {
    if (n.text !== undefined) return String(n.text)
    if (n.children) return n.children.map(getContent).join("").slice(0, 40)
    return ""
  }

  if (node?.$?.pid) {
    result.push({
      path,
      type: node.type,
      pid: node.$.pid,
      content: getContent(node),
    })
  }

  if (node?.children) {
    node.children.forEach((child: any, index: number) => {
      collectNodesWithPid(child, `${path}-${index}`, result)
    })
  }

  return result
}

// 单个树节点组件 - 用 pid 做 key，挂载时触发动画
function TreeNodeItem({
  node,
  path,
  depth,
  isExpanded,
  hasChildren,
  onToggle,
  isInitialRender = false,
}: {
  node: any
  path: string
  depth: number
  isExpanded: boolean
  hasChildren: boolean
  onToggle: () => void
  isInitialRender?: boolean
}) {
  // 组件挂载时检测是否是初始渲染
  const [isNew, setIsNew] = useState(!isInitialRender)

  useEffect(() => {
    if (isNew) {
      // 2秒后动画结束
      const timer = setTimeout(() => setIsNew(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [isNew])

  const indent = depth * 16

  const typeColors: Record<string, string> = {
    root: "text-purple-600 font-semibold",
    heading: "text-blue-600",
    paragraph: "text-gray-700",
    text: "text-green-600",
    list: "text-orange-600",
    listitem: "text-yellow-600",
    code: "text-pink-600",
    quote: "text-teal-600",
    link: "text-indigo-600",
    __ghost__: "text-gray-400 italic",
  }

  const getContent = (n: any): string => {
    if (n.text !== undefined) return String(n.text)
    if (n.children) {
      return n.children.map(getContent).join("").slice(0, 40)
    }
    return ""
  }

  const content = getContent(node)
  const displayContent =
    content.length > 30 ? content.slice(0, 30) + "..." : content
  const pid = node.$?.pid

  // 新节点红色高亮，否则悬停效果
  const rowHighlightClass = isNew
    ? "bg-red-50/50 border-l-2 border-red-400 animate-pulse"
    : "hover:bg-gray-50"

  const pidBadgeClass = isNew
    ? "ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border truncate inline-block transition-all duration-700 max-w-[300px] text-red-600 bg-red-50 border-red-200"
    : "ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border truncate inline-block transition-all duration-700 max-w-[300px] text-green-600 bg-green-50 border-green-200"

  return (
    <div
      className={`flex items-center py-1 rounded group transition-all duration-500 ${rowHighlightClass}`}
      style={{ paddingLeft: `${indent}px` }}
    >
      {hasChildren ? (
        <span className="w-4 h-4 mr-1 flex items-center justify-center text-gray-400 text-xs">
          ▼
        </span>
      ) : (
        <span className="w-4 h-4 mr-1" />
      )}

      <span
        className={`text-xs font-mono mr-2 ${typeColors[node.type] || "text-gray-600"}`}
      >
        {node.type}
      </span>

      {node.tag && (
        <span className="text-[10px] bg-gray-100 text-gray-600 px-1 rounded mr-2">
          {node.tag}
        </span>
      )}

      {displayContent && (
        <span className="text-[10px] text-gray-500 truncate max-w-[150px] mr-2">
          "{displayContent}"
        </span>
      )}

      {pid ? (
        <span className={pidBadgeClass} title={pid}>
          {pid}
        </span>
      ) : (
        <span
          className="ml-auto text-[10px] text-gray-300 inline-block"
          style={{ width: "22ch" }}
        >
          -
        </span>
      )}
    </div>
  )
}

// Lexical 树形视图组件 - 始终展开所有节点
function LexicalTreeView({
  state,
  scrollContainerId,
}: {
  state: SerializedEditorState | null
  scrollContainerId: string
}) {
  const isInitialRenderRef = useRef(true)
  const prevStateRef = useRef<SerializedEditorState | null>(null)

  // 第一次渲染标记
  useEffect(() => {
    if (state && isInitialRenderRef.current) {
      isInitialRenderRef.current = false
      prevStateRef.current = state
    }
  }, [state])

  if (!state) {
    return (
      <div className="text-gray-400 text-center py-8">等待编辑器初始化...</div>
    )
  }

  // 递归渲染节点 - 始终展开所有子节点
  const renderNode = (
    node: any,
    path: string = "root",
    depth: number = 0
  ): JSX.Element | null => {
    if (!node) return null

    // 跳过 ghost 节点（它们只用于保留未匹配的 ID，不需要显示）
    if (node.type === "__ghost__") return null

    const hasChildren = node.children && node.children.length > 0
    const pid = node.$?.pid

    // 使用 pid 作为 key，如果没有 pid 则使用 path
    // 这样当 pid 变化时，React 会重新创建组件，触发新节点动画
    const key = pid || path

    return (
      <div key={key} data-path={path}>
        <TreeNodeItem
          node={node}
          path={path}
          depth={depth}
          isExpanded={true}
          hasChildren={hasChildren}
          onToggle={() => {}} // 不再支持折叠
          isInitialRender={isInitialRenderRef.current}
        />

        {hasChildren && (
          <div>
            {node.children.map((child: any, index: number) =>
              renderNode(child, `${path}-${index}`, depth + 1)
            )}
          </div>
        )}
      </div>
    )
  }

  // 检测新节点并滚动
  useEffect(() => {
    if (!state || isInitialRenderRef.current) return

    // 获取之前的 PID 集合
    const prevPids = new Set<string>()
    if (prevStateRef.current?.root) {
      const walk = (node: any) => {
        if (node?.$?.pid) prevPids.add(node.$.pid)
        node?.children?.forEach(walk)
      }
      walk(prevStateRef.current.root)
    }

    // 找到第一个新节点的路径
    let firstNewPath: string | null = null
    const findNew = (node: any, path: string) => {
      if (firstNewPath) return
      if (node?.$?.pid && !prevPids.has(node.$.pid)) {
        firstNewPath = path
        return
      }
      if (node?.children?.length) {
        node.children.forEach((child: any, index: number) => {
          findNew(child, `${path}-${index}`)
        })
      }
    }
    findNew(state.root, "root")

    // 滚动到新节点
    if (firstNewPath) {
      setTimeout(() => {
        const container = document.getElementById(scrollContainerId)
        if (container) {
          const element = container.querySelector(
            `[data-path="${firstNewPath}"]`
          ) as HTMLElement
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        }
      }, 100)
    }

    prevStateRef.current = state
  }, [state, scrollContainerId])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[10px] text-gray-400">所有节点已展开</span>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto">
        <div className="font-mono text-sm">{renderNode(state.root)}</div>
      </div>
    </div>
  )
}

// 统计节点数
function countNodes(state: SerializedEditorState | null): number {
  if (!state?.root) return 0
  let count = 0
  const walk = (node: any) => {
    count++
    node?.children?.forEach(walk)
  }
  walk(state.root)
  return count
}

// 统计有 ID 的节点
function countIds(state: SerializedEditorState | null): number {
  if (!state?.root) return 0
  let count = 0
  const walk = (node: any) => {
    if (node?.$?.pid) count++
    node?.children?.forEach(walk)
  }
  walk(state.root)
  return count
}

// LocalStorage keys
const STORAGE_KEYS = {
  markdown: "lexical-demo-markdown",
  lexicalState: "lexical-demo-state",
  regressionCases: "lexical-demo-regression-cases",
}

// 回归测试用例类型
interface RegressionCase {
  id: string
  timestamp: number
  oldMarkdown: string
  newMarkdown: string
  oldNodeCount: number
  newNodeCount: number
  matchedCount: number
  preservationRate: number
  previousRate: number | null
  rateDrop: number
}

// 保存状态到 localStorage
function savePersistedState(markdown: string, state: SerializedEditorState) {
  try {
    localStorage.setItem(STORAGE_KEYS.markdown, markdown)
    localStorage.setItem(STORAGE_KEYS.lexicalState, JSON.stringify(state))
  } catch (e) {
    console.warn("Failed to save state:", e)
  }
}

// Canvas Minimap 组件 - 简化版：只展示结构 + 新节点红色闪烁
function CanvasMinimap({
  state,
  scrollContainerId,
}: {
  state: SerializedEditorState | null
  scrollContainerId: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewportRatio, setViewportRatio] = useState({ top: 0, height: 1 })
  const newNodesRef = useRef<Set<string>>(new Set())
  const prevStateRef = useRef<SerializedEditorState | null>(null)
  const animationRef = useRef<number | null>(null)
  const isInitialRenderRef = useRef(true)

  // 检测新节点（通过比较前后状态的 PID 集合）
  useEffect(() => {
    if (!state) return

    // 第一次渲染不检测新节点
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false
      prevStateRef.current = state
      return
    }

    const getAllPids = (s: SerializedEditorState) => {
      const pids = new Set<string>()
      const walk = (node: any) => {
        if (node?.$?.pid) pids.add(node.$.pid)
        node?.children?.forEach(walk)
      }
      walk(s.root)
      return pids
    }

    const currentPids = getAllPids(state)
    const prevPids = prevStateRef.current
      ? getAllPids(prevStateRef.current)
      : new Set<string>()

    // 找到新节点（当前有但之前没有的 PID）
    const newPids = new Set<string>()
    currentPids.forEach((pid) => {
      if (!prevPids.has(pid)) {
        newPids.add(pid)
      }
    })

    if (newPids.size > 0) {
      // 添加到新节点集合
      newPids.forEach((pid) => newNodesRef.current.add(pid))

      // 3秒后移除
      setTimeout(() => {
        newPids.forEach((pid) => newNodesRef.current.delete(pid))
      }, 3000)
    }

    prevStateRef.current = state
  }, [state])

  // 收集所有节点（DFS）
  const collectNodes = useCallback(() => {
    if (!state?.root) return []

    const nodes: Array<{
      depth: number
      isNew: boolean
      hasContent: boolean
    }> = []

    const walk = (node: any, depth: number) => {
      const pid = node?.$?.pid
      const isNew = pid ? newNodesRef.current.has(pid) : false

      // 判断是否有内容（非空节点）
      const hasContent =
        node?.type !== "paragraph" ||
        (node.children?.length > 0 &&
          node.children.some((c: any) => c.text?.trim()))

      nodes.push({
        depth: Math.min(depth, 6),
        isNew,
        hasContent,
      })

      if (node?.children?.length) {
        node.children.forEach((child: any) => walk(child, depth + 1))
      }
    }

    walk(state.root, 0)
    return nodes
  }, [state])

  // 动画循环
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let startTime = Date.now()

    const animate = () => {
      const nodes = collectNodes()
      if (nodes.length === 0) return

      // 设置 canvas 尺寸
      const dpr = window.devicePixelRatio || 1
      const displayWidth = canvas.clientWidth
      const displayHeight = canvas.clientHeight
      const rowHeight = 4
      const totalHeight = Math.max(displayHeight, nodes.length * rowHeight)

      canvas.width = displayWidth * dpr
      canvas.height = totalHeight * dpr
      ctx.scale(dpr, dpr)

      // 清空画布
      ctx.fillStyle = "#f9fafb"
      ctx.fillRect(0, 0, displayWidth, totalHeight)

      // 计算闪烁效果（新节点红色闪烁）
      const elapsed = (Date.now() - startTime) / 1000
      const pulseIntensity = (Math.sin(elapsed * 6) + 1) / 2 // 0-1 正弦波，速度稍快

      // 绘制每个节点
      const indentWidth = 5

      nodes.forEach((node, index) => {
        const y = index * rowHeight
        const x = node.depth * indentWidth + 2
        const barWidth = Math.max(displayWidth - x - 4, 6)
        const barHeight = rowHeight - 1

        if (node.isNew) {
          // 新节点：红色闪烁
          const redIntensity = Math.floor(200 + pulseIntensity * 55)
          ctx.fillStyle = `rgb(${redIntensity}, 60, 60)`
          ctx.fillRect(x, y, barWidth, barHeight)

          // 高亮边框
          ctx.strokeStyle = `rgba(255, 100, 100, ${0.5 + pulseIntensity * 0.5})`
          ctx.lineWidth = 1
          ctx.strokeRect(x, y, barWidth, barHeight)
        } else {
          // 普通节点：统一灰度，有内容的深一点，空的浅一点
          ctx.fillStyle = node.hasContent ? "#9ca3af" : "#d1d5db"
          ctx.fillRect(x, y, barWidth, barHeight)
        }
      })

      // 更新视口比例
      const updateViewport = () => {
        const container = document.getElementById(scrollContainerId)
        if (container) {
          const ratio = container.scrollTop / container.scrollHeight
          const viewportHeight = container.clientHeight / container.scrollHeight
          setViewportRatio({
            top: Math.max(0, Math.min(1, ratio)),
            height: Math.max(0.05, Math.min(1, viewportHeight)),
          })
        }
      }
      updateViewport()

      // 继续动画
      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    // 滚动监听
    const container = document.getElementById(scrollContainerId)
    const handleScroll = () => {
      if (container) {
        const ratio = container.scrollTop / container.scrollHeight
        const viewportHeight = container.clientHeight / container.scrollHeight
        setViewportRatio({
          top: Math.max(0, Math.min(1, ratio)),
          height: Math.max(0.05, Math.min(1, viewportHeight)),
        })
      }
    }

    if (container) {
      container.addEventListener("scroll", handleScroll)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (container) {
        container.removeEventListener("scroll", handleScroll)
      }
    }
  }, [collectNodes, scrollContainerId])

  // 点击 minimap 跳转
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const y = e.clientY - rect.top
    const ratio = y / rect.height

    const container = document.getElementById(scrollContainerId)
    if (container) {
      container.scrollTop = ratio * container.scrollHeight
    }
  }

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ imageRendering: "pixelated" }}
        onClick={handleClick}
      />
      {/* 视口指示器 */}
      <div
        className="absolute left-0 right-0 bg-blue-400/20 pointer-events-none transition-all duration-100"
        style={{
          top: `${viewportRatio.top * 100}%`,
          height: `${viewportRatio.height * 100}%`,
        }}
      />
    </div>
  )
}

// 从 localStorage 加载状态
function loadPersistedState(): {
  markdown: string | null
  state: SerializedEditorState | null
} {
  try {
    const markdown = localStorage.getItem(STORAGE_KEYS.markdown)
    const stateStr = localStorage.getItem(STORAGE_KEYS.lexicalState)
    const state = stateStr ? JSON.parse(stateStr) : null
    return { markdown, state }
  } catch (e) {
    console.warn("Failed to load state:", e)
    return { markdown: null, state: null }
  }
}

// 保存回归测试用例到 localStorage
function saveRegressionCase(newCase: RegressionCase) {
  try {
    const existing = loadRegressionCases()
    // 避免重复保存相同的内容（检查新旧 markdown 是否已存在）
    const isDuplicate = existing.some(
      (c) =>
        c.oldMarkdown === newCase.oldMarkdown &&
        c.newMarkdown === newCase.newMarkdown
    )
    if (isDuplicate) return false

    const updated = [newCase, ...existing].slice(0, 100) // 最多保留 100 条
    localStorage.setItem(STORAGE_KEYS.regressionCases, JSON.stringify(updated))
    return true
  } catch (e) {
    console.warn("Failed to save regression case:", e)
    return false
  }
}

// 从 localStorage 加载回归测试用例
function loadRegressionCases(): RegressionCase[] {
  try {
    const str = localStorage.getItem(STORAGE_KEYS.regressionCases)
    return str ? JSON.parse(str) : []
  } catch (e) {
    console.warn("Failed to load regression cases:", e)
    return []
  }
}

// 删除回归测试用例
function deleteRegressionCase(id: string) {
  try {
    const existing = loadRegressionCases()
    const updated = existing.filter((c) => c.id !== id)
    localStorage.setItem(STORAGE_KEYS.regressionCases, JSON.stringify(updated))
  } catch (e) {
    console.warn("Failed to delete regression case:", e)
  }
}

// IndexedDB key for saving directory handle
const DB_NAME = "lexical-demo"
const DB_VERSION = 1
const STORE_NAME = "settings"
const DIR_HANDLE_KEY = "regressionCasesDir"

// Open IndexedDB
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

// Save directory handle to IndexedDB
async function saveDirectoryHandle(handle: FileSystemDirectoryHandle | null) {
  if (!handle) return
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, "readwrite")
  const store = tx.objectStore(STORE_NAME)
  await new Promise<void>((resolve, reject) => {
    const request = store.put(handle, DIR_HANDLE_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Get saved directory handle from IndexedDB
async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    return new Promise((resolve, reject) => {
      const request = store.get(DIR_HANDLE_KEY)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

// 导出回归测试用例为 JSON 文件到选择的目录
async function exportRegressionCases(cases: RegressionCase[]) {
  try {
    // Check File System Access API support
    if (!("showDirectoryPicker" in window)) {
      // Fallback to traditional download
      const data = {
        exportTime: new Date().toISOString(),
        totalCases: cases.length,
        cases: cases.map((c, index) => ({
          ...c,
          caseName: `case-${String(cases.length - index).padStart(3, "0")}-rate-${(c.preservationRate * 100).toFixed(1)}`,
        })),
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `lexical-regression-cases-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return
    }

    // Try to get saved directory handle
    let dirHandle = await getDirectoryHandle()

    // If no saved handle or user wants to change, show picker
    if (!dirHandle) {
      dirHandle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
      })
      await saveDirectoryHandle(dirHandle)
    }

    // Request permission (required in some browsers)
    const permission = await (dirHandle as any).requestPermission({
      mode: "readwrite",
    })
    if (permission !== "granted" || !dirHandle) {
      // Permission denied, show picker again
      dirHandle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
      })
      await saveDirectoryHandle(dirHandle)
    }

    // Write file to directory
    if (!dirHandle) {
      throw new Error("No directory selected")
    }
    const filename = `lexical-regression-cases-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`
    const fileHandle = await dirHandle.getFileHandle(filename, {
      create: true,
    })
    const writable = await fileHandle.createWritable()

    const data = {
      exportTime: new Date().toISOString(),
      totalCases: cases.length,
      cases: cases.map((c, index) => ({
        ...c,
        caseName: `case-${String(cases.length - index).padStart(3, "0")}-rate-${(c.preservationRate * 100).toFixed(1)}`,
      })),
    }

    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()

    alert(`✅ 已导出 ${cases.length} 个用例到: ${filename}`)
  } catch (err: any) {
    if (err.name === "AbortError") {
      // User cancelled, do nothing
      return
    }
    console.error("Export failed:", err)
    alert(`导出失败: ${err.message}`)
  }
}

// 导出回归测试用例为测试数据目录格式
// 使用说明：
// 1. 导出 JSON 文件
// 2. 复制到 packages/lexical/src/test-data/regression-cases/
// 3. 运行: node add-regression-cases.mjs
function exportAsTestData(cases: RegressionCase[]) {
  cases.forEach((c, index) => {
    const caseNum = String(index + 1).padStart(2, "0")
    const rateStr = (c.preservationRate * 100).toFixed(1)
    const dropStr =
      c.rateDrop > 0 ? `-drop-${(c.rateDrop * 100).toFixed(1)}` : ""
    const folderName = `case-${caseNum}-preservation-${rateStr}${dropStr}`

    // 简单导出：逐个下载
    const oldBlob = new Blob([c.oldMarkdown], { type: "text/markdown" })
    const newBlob = new Blob([c.newMarkdown], { type: "text/markdown" })

    const oldUrl = URL.createObjectURL(oldBlob)
    const newUrl = URL.createObjectURL(newBlob)

    setTimeout(() => {
      const a1 = document.createElement("a")
      a1.href = oldUrl
      a1.download = `${folderName}/old.md`
      a1.click()

      setTimeout(() => {
        const a2 = document.createElement("a")
        a2.href = newUrl
        a2.download = `${folderName}/new.md`
        a2.click()
        URL.revokeObjectURL(oldUrl)
        URL.revokeObjectURL(newUrl)
      }, 100)
    }, index * 200)
  })
}

// 回归测试用例面板组件
function RegressionCasesPanel({
  cases,
  onCasesChange,
}: {
  cases: RegressionCase[]
  onCasesChange: () => void
}) {
  const [expandedCase, setExpandedCase] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [hasDirHandle, setHasDirHandle] = useState(false)

  // Check if we have a saved directory handle
  useEffect(() => {
    getDirectoryHandle().then((handle) => setHasDirHandle(!!handle))
  }, [])

  // Export with optional directory change
  const handleExport = async (forceChooseDir = false) => {
    if (forceChooseDir) {
      // Clear saved handle to force re-selection
      const db = await openDB()
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(DIR_HANDLE_KEY)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
      setHasDirHandle(false)
    }
    await exportRegressionCases(cases)
    // Update status after export
    const handle = await getDirectoryHandle()
    setHasDirHandle(!!handle)
  }

  if (cases.length === 0) {
    return (
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-[11px] text-gray-500">
        📊 保留率下降时将自动收集测试用例
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 bg-gray-50">
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-gray-700">
            🐛 回归测试用例 ({cases.length})
          </span>
          <span className="text-[10px] text-gray-500">
            保留率下降时自动收集
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-[10px] text-blue-600 hover:text-blue-700"
          >
            {showDetails ? "收起" : "展开"}
          </button>
          <button
            onClick={() => handleExport(false)}
            className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
            title={hasDirHandle ? "导出到已选目录" : "选择导出目录"}
          >
            {hasDirHandle ? "📁 导出" : "📂 导出..."}
          </button>
          {hasDirHandle && (
            <button
              onClick={() => handleExport(true)}
              className="text-[10px] text-gray-500 hover:text-gray-700 px-1"
              title="更换导出目录"
            >
              更换
            </button>
          )}
          <button
            onClick={() => {
              if (confirm("确定要清空所有收集的测试用例吗？")) {
                localStorage.removeItem(STORAGE_KEYS.regressionCases)
                onCasesChange()
              }
            }}
            className="px-2 py-1 text-[10px] bg-red-100 text-red-600 rounded hover:bg-red-200"
          >
            清空
          </button>
        </div>
      </div>

      {/* Cases List */}
      {showDetails && (
        <div className="max-h-48 overflow-auto border-t border-gray-200">
          {cases.map((c) => (
            <div
              key={c.id}
              className={`px-4 py-2 border-b border-gray-100 cursor-pointer transition-colors ${
                expandedCase === c.id ? "bg-blue-50" : "hover:bg-gray-100"
              }`}
              onClick={() =>
                setExpandedCase(expandedCase === c.id ? null : c.id)
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-gray-500">
                    {new Date(c.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`font-mono ${c.rateDrop > 0.2 ? "text-red-600 font-bold" : "text-orange-600"}`}
                  >
                    {(c.preservationRate * 100).toFixed(1)}%
                  </span>
                  {c.previousRate !== null && (
                    <span className="text-gray-400">
                      ↓ {(c.rateDrop * 100).toFixed(1)}%
                    </span>
                  )}
                  <span className="text-gray-500">
                    {c.oldNodeCount}→{c.newNodeCount} 节点
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteRegressionCase(c.id)
                    onCasesChange()
                  }}
                  className="text-[10px] text-red-400 hover:text-red-600"
                >
                  删除
                </button>
              </div>

              {/* Expanded Details */}
              {expandedCase === c.id && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <div className="text-gray-500 mb-1">Old Markdown:</div>
                      <pre className="bg-white p-2 rounded border border-gray-200 overflow-auto max-h-24 text-gray-700">
                        {c.oldMarkdown}
                      </pre>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">New Markdown:</div>
                      <pre className="bg-white p-2 rounded border border-gray-200 overflow-auto max-h-24 text-gray-700">
                        {c.newMarkdown}
                      </pre>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const data = {
                        old: c.oldMarkdown,
                        new: c.newMarkdown,
                        stats: {
                          oldNodeCount: c.oldNodeCount,
                          newNodeCount: c.newNodeCount,
                          matchedCount: c.matchedCount,
                          preservationRate: c.preservationRate,
                        },
                      }
                      navigator.clipboard.writeText(
                        JSON.stringify(data, null, 2)
                      )
                      alert("已复制到剪贴板")
                    }}
                    className="mt-2 px-2 py-1 text-[10px] bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                  >
                    复制为 JSON
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Debug Panel Component
function DebugPanel({
  oldState,
  currentMarkdown,
  previousMarkdown,
  onRegressionDetected,
}: {
  oldState: SerializedEditorState | null
  currentMarkdown: string
  previousMarkdown: string
  onRegressionDetected: () => void
}) {
  const [stats, setStats] = useState<any>(null)
  const prevRateRef = useRef<number | null>(null)
  const hasCheckedRef = useRef(false)

  useEffect(() => {
    const run = async () => {
      if (!oldState || !currentMarkdown) return
      const intermediateStr = await markdown2lexical(currentMarkdown)
      const intermediateState = JSON.parse(intermediateStr)
      const stats = getReconciliationStats(oldState, intermediateState)
      setStats(stats)

      // 检测保留率下降
      const currentRate = stats.idPreservationRate
      const previousRate = prevRateRef.current

      // 只在有前一次记录且有下降时收集
      if (
        hasCheckedRef.current &&
        previousRate !== null &&
        currentRate < previousRate
      ) {
        const rateDrop = previousRate - currentRate

        // 收集测试用例
        const newCase: RegressionCase = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          oldMarkdown: previousMarkdown,
          newMarkdown: currentMarkdown,
          oldNodeCount: stats.oldNodeCount,
          newNodeCount: stats.newNodeCount,
          matchedCount: stats.matchedCount,
          preservationRate: currentRate,
          previousRate: previousRate,
          rateDrop: rateDrop,
        }

        const saved = saveRegressionCase(newCase)
        if (saved) {
          console.log("🐛 Regression case saved:", newCase)
          onRegressionDetected()
        }
      }

      prevRateRef.current = currentRate
      hasCheckedRef.current = true
    }
    run()
  }, [oldState, currentMarkdown, previousMarkdown, onRegressionDetected])

  if (!stats) return null

  // 根据保留率显示不同颜色
  const rateColor =
    stats.idPreservationRate < 0.5
      ? "text-red-600"
      : stats.idPreservationRate < 0.8
        ? "text-orange-600"
        : "text-green-600"

  return (
    <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
      <div className="flex items-center gap-4 text-[11px]">
        <span className="font-medium text-gray-600">🔄 Reconciliation:</span>
        <span className="text-gray-500">
          旧{" "}
          <span className="font-mono text-gray-700">{stats.oldNodeCount}</span>
        </span>
        <span className="text-gray-500">
          新{" "}
          <span className="font-mono text-gray-700">{stats.newNodeCount}</span>
        </span>
        <span className="text-gray-500">
          匹配{" "}
          <span className="font-mono text-green-600">{stats.matchedCount}</span>
        </span>
        <span className="text-gray-500">
          保留率{" "}
          <span className={`font-mono ${rateColor}`}>
            {(stats.idPreservationRate * 100).toFixed(1)}%
          </span>
        </span>
      </div>
    </div>
  )
}

// 默认 Markdown 内容
const defaultMarkdown = `# 欢迎使用 Lexical Diff Demo

这是一个演示**持久化 ID**功能的示例文档。

## 特性

- 📝 支持 Markdown 和 Lexical 双向转换
- 🔄 自动保留节点 ID
- 🎨 可视化展示 ID 变化

## 试一试

1. 在 Markdown 编辑器中修改这段文字
2. 观察右侧 State Tree 中的 PID 变化
3. 你会发现已有段落的 ID 被保留了！

> 💡 提示：红色闪烁表示新节点，绿色表示 ID 已保留。
`

export default function IndexPage() {
  const [isClient, setIsClient] = useState(false)
  const [activeTab, setActiveTab] = useState<"lexical" | "markdown">("lexical")
  const [markdown, setMarkdown] = useState(defaultMarkdown)
  const [lexicalState, setLexicalState] =
    useState<SerializedEditorState | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  // 离线编辑模式状态
  const [isOfflineMode, setIsOfflineMode] = useState(false)
  const [stagedMarkdown, setStagedMarkdown] = useState<string | null>(null)

  // 回归测试用例状态
  const [regressionCases, setRegressionCases] = useState<RegressionCase[]>([])
  const previousMarkdownRef = useRef<string>(defaultMarkdown)

  // 用于防止循环更新
  const updatingFromMarkdown = useRef(false)
  const updatingFromLexical = useRef(false)

  // 仅在客户端加载持久化状态
  useEffect(() => {
    setIsClient(true)
    const persisted = loadPersistedState()

    if (persisted.markdown && persisted.state) {
      setMarkdown(persisted.markdown)
      setLexicalState(persisted.state)
      previousMarkdownRef.current = persisted.markdown
    } else {
      // 没有持久化数据，生成默认内容
      const init = async () => {
        const stateStr = await markdown2lexical(defaultMarkdown)
        setMarkdown(defaultMarkdown)
        setLexicalState(JSON.parse(stateStr))
        previousMarkdownRef.current = defaultMarkdown
      }
      init()
    }

    // 加载回归测试用例
    setRegressionCases(loadRegressionCases())
  }, [])

  // 使用 ref 避免闭包问题
  const lexicalStateRef = useRef(lexicalState)
  useEffect(() => {
    lexicalStateRef.current = lexicalState
  }, [lexicalState])

  // 提交暂存的更改（离线模式）
  const commitStagedChanges = useCallback(async () => {
    if (!stagedMarkdown || !lexicalStateRef.current) return

    setIsSyncing(true)
    try {
      // 保存旧的 markdown 用于回归检测
      const oldMarkdown = markdown

      const intermediateStr = await markdown2lexical(stagedMarkdown, [], [], {
        useHarness: false,
      })
      const intermediateState = JSON.parse(intermediateStr)
      const reconciledState = reconcileState(
        lexicalStateRef.current,
        intermediateState,
        { preserveGhostNodes: false }
      )

      const stats = getReconciliationStats(
        lexicalStateRef.current,
        intermediateState
      )
      console.log("Batch commit stats:", stats)

      setLexicalState(reconciledState)
      setMarkdown(stagedMarkdown)
      setStagedMarkdown(null)

      // 更新 previous markdown 引用
      previousMarkdownRef.current = stagedMarkdown
    } catch (error) {
      console.error("Commit error:", error)
    } finally {
      setIsSyncing(false)
    }
  }, [stagedMarkdown, markdown])

  // Markdown 变化时同步到 Lexical
  const handleMarkdownChange = useCallback(
    async (newMarkdown: string) => {
      if (updatingFromLexical.current) return

      updatingFromMarkdown.current = true

      // 离线模式：暂存更改，不立即提交
      if (isOfflineMode) {
        setStagedMarkdown(newMarkdown)
        updatingFromMarkdown.current = false
        return
      }

      // 保存旧的 markdown 用于回归检测
      const oldMarkdown = previousMarkdownRef.current

      // 实时模式：立即提交
      setMarkdown(newMarkdown)
      setIsSyncing(true)

      try {
        const intermediateStr = await markdown2lexical(newMarkdown, [], [], {
          useHarness: false,
        })
        const intermediateState = JSON.parse(intermediateStr)

        const currentLexicalState = lexicalStateRef.current
        if (currentLexicalState) {
          const reconciledState = reconcileState(
            currentLexicalState,
            intermediateState,
            { preserveGhostNodes: false }
          )
          const stats = getReconciliationStats(
            currentLexicalState,
            intermediateState
          )
          console.log("Reconciliation stats:", stats)
          setLexicalState(reconciledState)
        } else {
          setLexicalState(intermediateState)
        }

        // 更新 previous markdown 引用
        previousMarkdownRef.current = newMarkdown
      } catch (error) {
        console.error("Markdown to Lexical error:", error)
      } finally {
        setIsSyncing(false)
        updatingFromMarkdown.current = false
      }
    },
    [isOfflineMode]
  )

  // 持久化状态到 localStorage
  useEffect(() => {
    if (lexicalState && markdown) {
      savePersistedState(markdown, lexicalState)
    }
  }, [lexicalState, markdown])

  // Lexical 变化时同步到 Markdown
  const handleLexicalChange = useCallback(
    async (newState: SerializedEditorState) => {
      if (updatingFromMarkdown.current) return

      updatingFromLexical.current = true
      setLexicalState(newState)
      setIsSyncing(true)

      try {
        const stateStr = JSON.stringify(newState)
        const newMarkdown = await lexical2markdown(stateStr)
        setMarkdown(newMarkdown)
      } catch (error) {
        console.error("Lexical to Markdown error:", error)
      } finally {
        setIsSyncing(false)
        updatingFromLexical.current = false
      }
    },
    []
  )

  if (!isClient) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">Lexical Diff Demo</h1>
          {isSyncing && (
            <span className="text-xs text-blue-600 animate-pulse">
              🔄 同步中...
            </span>
          )}
          {isOfflineMode && stagedMarkdown && (
            <span className="text-xs text-amber-600 font-medium">
              ⏸️ 已暂存更改
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* 离线模式切换 */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                className={`relative w-10 h-5 rounded-full transition-colors ${isOfflineMode ? "bg-amber-500" : "bg-gray-300"}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isOfflineMode}
                  onChange={(e) => {
                    setIsOfflineMode(e.target.checked)
                    if (!e.target.checked && stagedMarkdown) {
                      // 切换回实时模式时自动提交
                      commitStagedChanges()
                    }
                  }}
                />
                <div
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isOfflineMode ? "translate-x-5" : ""}`}
                />
              </div>
              <span className="text-xs text-gray-600">
                {isOfflineMode ? "离线模式" : "实时模式"}
              </span>
            </label>
          </div>

          {/* 提交按钮（离线模式且有暂存时显示） */}
          {isOfflineMode && stagedMarkdown && (
            <button
              onClick={commitStagedChanges}
              disabled={isSyncing}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-xs font-medium rounded transition-colors flex items-center gap-1"
            >
              <span>✓</span>
              <span>提交更改</span>
            </button>
          )}

          <a
            href="https://github.com/mayneyao/eidos"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-blue-600 transition-colors"
          >
            GitHub →
          </a>
        </div>
      </header>

      {/* Main Content - Two Column Layout */}
      <main className="flex-1 p-4 overflow-hidden">
        <div className="max-w-[1920px] mx-auto h-full flex gap-4">
          {/* Left: Editor with Tabs */}
          <div className="flex-1 flex flex-col min-w-0 bg-white rounded-lg shadow-sm border overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b bg-gray-50">
              <button
                onClick={() => setActiveTab("lexical")}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === "lexical"
                    ? "text-blue-600 bg-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                📝 Lexical Editor
                {activeTab === "lexical" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("markdown")}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === "markdown"
                    ? "text-blue-600 bg-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                📄 Markdown
                {activeTab === "markdown" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === "lexical" ? (
                <LexicalEditor
                  title=""
                  state={lexicalState}
                  onStateChange={handleLexicalChange}
                />
              ) : (
                <div className="h-full flex flex-col">
                  <MarkdownEditor
                    title=""
                    value={stagedMarkdown ?? markdown}
                    onChange={handleMarkdownChange}
                    isStaged={isOfflineMode && !!stagedMarkdown}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right: Lexical State Tree with Minimap */}
          <div className="flex-1 shrink-0 bg-white rounded-lg shadow-sm border flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
              <h2 className="font-semibold text-gray-900">
                🌲 Lexical State Tree
              </h2>
              <div className="flex items-center gap-3">
                <div className="flex gap-3 text-xs">
                  <span className="text-gray-500">
                    {countNodes(lexicalState)} 节点
                  </span>
                  <span className="text-green-600 font-medium">
                    {countIds(lexicalState)} 个 ID
                  </span>
                </div>
                <CopyStateButton state={lexicalState} />
                <ResetButton
                  onReset={() => {
                    localStorage.removeItem(STORAGE_KEYS.markdown)
                    localStorage.removeItem(STORAGE_KEYS.lexicalState)
                    window.location.reload()
                  }}
                />
              </div>
            </div>

            {/* Tree + Minimap Layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* Tree View */}
              <div
                className="flex-1 overflow-auto p-4"
                id="tree-scroll-container"
              >
                <LexicalTreeView
                  state={lexicalState}
                  scrollContainerId="tree-scroll-container"
                />
              </div>

              {/* Canvas Minimap */}
              <div className="w-24 border-l bg-gray-50 flex flex-col">
                <div className="flex-1 relative">
                  <CanvasMinimap
                    state={lexicalState}
                    scrollContainerId="tree-scroll-container"
                  />
                </div>
              </div>
            </div>

            {/* Debug Info */}
            <DebugPanel
              oldState={lexicalState}
              currentMarkdown={markdown}
              previousMarkdown={previousMarkdownRef.current}
              onRegressionDetected={() =>
                setRegressionCases(loadRegressionCases())
              }
            />

            {/* Regression Cases */}
            <RegressionCasesPanel
              cases={regressionCases}
              onCasesChange={() => setRegressionCases(loadRegressionCases())}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
