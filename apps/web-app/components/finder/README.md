# Finder 文件管理组件

一个高性能的、类似 macOS Finder 的文件管理组件，用于浏览 Space 目录和挂载文件夹，支持文件搜索和选择。

## 特性

- 🚀 **高性能虚拟滚动**：自己实现，支持大量文件列表（10000+ 项）
- 🔍 **集成 ripgrep 搜索**：快速搜索 Space 目录和挂载文件夹
- 📁 **Space + Mounts**：浏览 Space 目录和挂载的外部文件夹
- ⌨️ **键盘导航**：完整的键盘快捷键支持
- 🎨 **精致 UI**：符合 Eidos 设计系统，支持浅色/深色模式
- 📱 **响应式**：适配不同屏幕尺寸

## 使用方式

### 基础使用（文件选择器）

```tsx
import { useState } from "react"
import { FinderDialog } from "@/components/finder"
import { Button } from "@/components/ui/button"

function MyComponent() {
  const [open, setOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const handleSelect = (paths: string[]) => {
    setSelectedFile(paths[0])
    console.log("Selected files:", paths)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>选择文件</Button>

      <FinderDialog
        open={open}
        onOpenChange={setOpen}
        title="选择文件"
        confirmLabel="选择"
        onSelect={handleSelect}
        selectMode="file" // "file" | "directory" | "both"
        allowMultiple={false}
        initialPath="~/"
      />
    </>
  )
}
```

### 选择文件夹

```tsx
<FinderDialog
  open={open}
  onOpenChange={setOpen}
  title="选择文件夹"
  confirmLabel="选择此文件夹"
  onSelect={handleSelect}
  selectMode="directory"
/>
```

### 多选

```tsx
<FinderDialog
  open={open}
  onOpenChange={setOpen}
  title="选择多个文件"
  confirmLabel="选择"
  onSelect={handleSelect}
  selectMode="file"
  allowMultiple={true}
/>
```

### 使用 useFinder Hook

如果需要在自定义 UI 中使用 Finder 逻辑：

```tsx
import { useFinder } from "@/components/finder"

function CustomFileBrowser() {
  const {
    currentPath,
    locations,
    items,
    isLoading,
    selectedPaths,
    searchQuery,
    canGoBack,
    navigateTo,
    navigateBack,
    toggleSelection,
    setSearchQuery,
    // ... 其他方法和状态
  } = useFinder({
    initialPath: "~/",
    selectMode: "file",
    onSelect: (paths) => console.log(paths),
  })

  return (
    // 自定义 UI
  )
}
```

## 组件 API

### FinderDialog Props

| 属性            | 类型                              | 默认值          | 说明             |
| --------------- | --------------------------------- | --------------- | ---------------- |
| `open`          | `boolean`                         | -               | 对话框是否打开   |
| `onOpenChange`  | `(open: boolean) => void`         | -               | 打开状态变化回调 |
| `title`         | `string`                          | `"Select File"` | 对话框标题       |
| `confirmLabel`  | `string`                          | `"Select"`      | 确认按钮文字     |
| `initialPath`   | `string`                          | `"~/"`          | 初始路径         |
| `selectMode`    | `"file" \| "directory" \| "both"` | `"both"`        | 可选类型         |
| `allowMultiple` | `boolean`                         | `false`         | 是否允许多选     |
| `onSelect`      | `(paths: string[]) => void`       | -               | 选择完成回调     |

### useFinder Hook

#### 参数

| 参数            | 类型                              | 说明                                   |
| --------------- | --------------------------------- | -------------------------------------- |
| `initialPath`   | `string`                          | 初始路径，如 `"~/"` 或 `"@/mountName"` |
| `selectMode`    | `"file" \| "directory" \| "both"` | 可选择的项目类型                       |
| `allowMultiple` | `boolean`                         | 是否允许多选                           |
| `onSelect`      | `(paths: string[]) => void`       | 选择回调                               |

#### 返回值

| 属性              | 类型                          | 说明                       |
| ----------------- | ----------------------------- | -------------------------- |
| `currentPath`     | `string`                      | 当前路径                   |
| `locations`       | `FinderLocation[]`            | 可用位置（Space + Mounts） |
| `items`           | `FinderItem[]`                | 当前目录项                 |
| `isLoading`       | `boolean`                     | 是否加载中                 |
| `isSearching`     | `boolean`                     | 是否搜索中                 |
| `selectedPaths`   | `Set<string>`                 | 已选择的路径               |
| `searchQuery`     | `string`                      | 搜索查询                   |
| `canGoBack`       | `boolean`                     | 能否返回                   |
| `canGoForward`    | `boolean`                     | 能否前进                   |
| `canGoUp`         | `boolean`                     | 能否到上级                 |
| `navigateTo`      | `(path: string) => void`      | 导航到路径                 |
| `navigateBack`    | `() => void`                  | 返回                       |
| `navigateForward` | `() => void`                  | 前进                       |
| `navigateUp`      | `() => void`                  | 到上级                     |
| `toggleSelection` | `(path, shift, meta) => void` | 切换选择                   |
| `setSearchQuery`  | `(query: string) => void`     | 设置搜索                   |

## 键盘快捷键

| 快捷键             | 功能      |
| ------------------ | --------- |
| `↑` / `↓`          | 导航项目  |
| `Shift + ↑/↓`      | 范围选择  |
| `Cmd/Ctrl + Click` | 多选      |
| `Enter`            | 确认选择  |
| `Space`            | 切换选择  |
| `Cmd/Ctrl + A`     | 全选      |
| `Cmd/Ctrl + F`     | 聚焦搜索  |
| `Cmd/Ctrl + [`     | 后退      |
| `Cmd/Ctrl + ]`     | 前进      |
| `Cmd/Ctrl + ↑`     | 上级目录  |
| `Escape`           | 取消/关闭 |

## 路径格式

- `~/` - Space 根目录
- `@/mountName` - 挂载的文件夹
- `~/path/to/file` - Space 内文件
- `@/mountName/path/to/file` - 挂载文件夹内文件

## 性能优化

- 虚拟滚动只渲染可视区域项
- RAF 节流处理滚动事件
- 滚动动量检测优化渲染
- Memoized 组件减少重渲染
- 搜索使用 ripgrep，性能极高

## 注意事项

1. 需要 desktop 模式才能使用文件系统功能
2. 搜索功能依赖 `@vscode/ripgrep`，在桌面端可用
3. 虚拟滚动使用 `transform` 实现 GPU 加速
