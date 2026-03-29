"use client"

interface MarkdownEditorProps {
  title?: string
  value: string
  onChange: (value: string) => void
  isStaged?: boolean
}

export function MarkdownEditor({
  title,
  value,
  onChange,
  isStaged,
}: MarkdownEditorProps) {
  const lineCount = value.split("\n").length
  const wordCount = value.split(/\s+/).filter(Boolean).length

  return (
    <div className="flex flex-col h-full">
      {title && (
        <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center shrink-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <div className="flex gap-3 text-xs text-gray-500">
            <span>{lineCount} 行</span>
            <span>{wordCount} 词</span>
            <span>{value.length} 字符</span>
          </div>
        </div>
      )}
      <div className="relative flex-1">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 w-full h-full p-4 font-mono text-sm resize-none
                     focus:outline-none focus:ring-inset focus:ring-2 
                     text-gray-700 leading-relaxed bg-white
                     ${isStaged ? "focus:ring-amber-500/30 bg-amber-50/30" : "focus:ring-blue-500/20"}`}
          placeholder="输入 Markdown..."
          spellCheck={false}
        />
        {isStaged && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded border border-amber-200">
            ⏸️ 未提交
          </div>
        )}
      </div>
    </div>
  )
}
