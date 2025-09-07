import React from "react"
import { Editor } from "../../editor"
import { DocPropertyGlobal } from "../../../doc-property-global"

/**
 * 测试 PropertyNavigationPlugin 功能的示例组件
 */
export const PropertyNavigationTestExample: React.FC = () => {
  const testDocId = "test-doc-property-navigation"

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">属性导航插件测试</h1>
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
          <h3 className="font-semibold text-blue-800 mb-2">双向导航测试：</h3>
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-blue-800">📝 编辑器 → 属性面板：</h4>
              <ol className="list-decimal list-inside text-blue-700 space-y-1 ml-4">
                <li>点击编辑器区域，将光标定位到文档的第一行开头</li>
                <li>按下 <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">↑</kbd> 上箭头键</li>
                <li>观察属性面板是否被激活（获得焦点并选中**最后一个**属性）</li>
              </ol>
            </div>
            <div>
              <h4 className="font-medium text-blue-800">🏷️ 属性面板 → 编辑器：</h4>
              <ol className="list-decimal list-inside text-blue-700 space-y-1 ml-4">
                <li>在属性面板中使用上下箭头键导航（不循环）</li>
                <li>在最后一个属性上按下 <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">↓</kbd> 下箭头键</li>
                <li>或者按 <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">Esc</kbd> 键立即跳转</li>
                <li>观察编辑器是否重新获得焦点</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 编辑器区域 */}
        <div className="lg:col-span-2">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-600">文档编辑器</span>
            </div>
            <div className="p-4">
              <Editor
                isActive
                isEditable={true}
                docId={testDocId}
                title="测试文档"
                showTitle
                autoFocus
                placeholder="在这里开始输入内容，然后将光标移到第一行开头按上箭头..."
                propertyComponent={<DocPropertyGlobal docId={testDocId} />}
              />
            </div>
          </div>
        </div>

        {/* 属性面板区域 */}
        <div className="lg:col-span-1">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-600">属性面板</span>
            </div>
            <div className="p-4">
              <DocPropertyGlobal docId={testDocId} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">预期行为：</h3>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-gray-800">📝 编辑器 → 属性面板：</h4>
            <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
              <li>当光标在文档第一行开头时，按上箭头键会激活属性面板</li>
              <li>属性面板会获得焦点并显示键盘导航状态</li>
              <li>如果存在属性，**最后一个**属性会被选中</li>
              <li>只有在文档绝对开头位置才会触发，其他位置按上箭头正常工作</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-800">🏷️ 属性面板 → 编辑器：</h4>
            <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
              <li>在最后一个属性上按下箭头键会跳转回编辑器</li>
              <li>按 Esc 键会立即跳转回编辑器</li>
              <li>如果没有属性，按下箭头键会直接跳转到编辑器</li>
              <li>编辑器会重新获得焦点并定位到文档开头</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PropertyNavigationTestExample
