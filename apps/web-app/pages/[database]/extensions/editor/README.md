# Extension Editor 更新说明

## 更改概述

已成功将 Extension 的代码编辑器从原来的 `CodeEditor` 替换为使用 `packages/code-editor` 中的 `SimpleCodeEditor` 组件。

## 文件更改

### 1. 新增文件
- `simple-code-editor-wrapper.tsx` - 适配器组件，将 `SimpleCodeEditor` 包装成与原 `CodeEditor` 兼容的接口

### 2. 修改文件
- `detail.tsx` - 更新导入和使用新的 `SimpleCodeEditorWrapper` 组件

## 技术实现

### SimpleCodeEditorWrapper 功能
- **接口兼容**: 保持与原 `CodeEditor` 相同的 props 接口
- **功能保留**: 
  - 支持 TypeScript/TSX 编译
  - 保存功能 (Ctrl+S)
  - Accept/Reject Changes 按钮
  - 多文件支持
  - 主题切换
- **简化界面**: 只显示标签页和编辑器区域，移除文件树等额外组件

### 核心特性
1. **多文件编辑**: 当前脚本 + 所有其他脚本文件
2. **标签页**: 支持文件切换和关闭
3. **代码补全**: TypeScript 语法高亮和智能提示
4. **保存机制**: 支持自定义编译器和默认 TypeScript 编译
5. **状态管理**: 集成现有的 `useEditorStore`

## 使用方式

```tsx
<SimpleCodeEditorWrapper
  ref={editorRef}
  value={editorContent}
  onSave={onSubmit}
  language={language}
  bindings={script.bindings}
  scriptId={script.id}
  theme={theme === "dark" ? "vs-dark" : "light"}
  customCompile={getCompileMethod(script)}
/>
```

## 优势

1. **轻量化**: 移除了不必要的 UI 组件，专注于代码编辑
2. **一致性**: 使用统一的代码编辑器组件
3. **可维护性**: 基于 `packages/code-editor` 的标准化实现
4. **功能完整**: 保留所有核心编辑功能

## 测试建议

1. 打开任意 Extension 的代码编辑页面
2. 验证代码高亮和补全功能
3. 测试多文件切换
4. 验证保存功能 (Ctrl+S)
5. 测试 Accept/Reject Changes 功能
6. 确认主题切换正常工作

## 注意事项

- 确保 `packages/code-editor` 的依赖已正确安装
- 如需添加更多功能，可以在 `SimpleCodeEditorWrapper` 中扩展
- 保持与原 `CodeEditor` 接口的兼容性
