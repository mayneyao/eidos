import type {
  BuiltInMarkdownShortcutId,
  MarkdownShortcutScope,
} from "@eidos.space/markdown"

export const chineseShortcutScopes: Record<MarkdownShortcutScope, string> = {
  "block-handle": "内容块",
  composer: "编辑浮层",
  document: "文档",
  editor: "编辑器",
  "list-item": "列表项",
  menu: "菜单",
  overlay: "浮层",
  selection: "选区",
  "source-editor": "源码编辑器",
}

export const chineseShortcutDescriptions: Record<
  BuiltInMarkdownShortcutId,
  string
> = {
  "block-editor.commit": "提交当前块的编辑内容",
  "block.move-down": "向下移动当前顶层内容块",
  "block.move-up": "向上移动当前顶层内容块",
  "composer.confirm": "确认单行编辑浮层",
  "document.save": "请求宿主保存文档",
  "format.bold": "切换富文本或 Markdown 源码的加粗格式",
  "format.italic": "切换富文本或 Markdown 源码的斜体格式",
  "history.redo": "重做上一次编辑操作",
  "history.undo": "撤销上一次编辑操作",
  "inline-atom.activate": "打开当前聚焦的行内元素",
  "insert.open-menu": "在空段落插入内容块，或在命令边界插入行内内容",
  "list-item.move-down": "在同级列表项中向下移动当前项",
  "list-item.toggle-checked": "切换当前任务列表项的勾选状态",
  "list-item.move-up": "在同级列表项中向上移动当前项",
  "menu.choose": "选择当前菜单项",
  "menu.next": "聚焦下一个菜单项",
  "menu.previous": "聚焦上一个菜单项",
  "overlay.dismiss": "关闭当前菜单或编辑浮层",
  "selection.clear": "清除当前块选区",
  "selection.enter-block": "选择光标所在的顶层内容块",
  "selection.extend-down": "向下扩展块选区",
  "selection.extend-up": "向上扩展块选区",
  "selection.edit-source": "编辑已选连续内容块的 Markdown 源码",
  "selection.select-all-blocks": "选择所有顶层内容块",
  "source-editor.copy-line-down": "向下复制选中的源码行",
  "source-editor.copy-line-up": "向上复制选中的源码行",
  "source-editor.delete-line": "删除选中的源码行",
  "source-editor.indent": "增加选中源码行的缩进",
  "source-editor.move-line-down": "向下移动选中的源码行",
  "source-editor.move-line-up": "向上移动选中的源码行",
  "source-editor.outdent": "减少选中源码行的缩进",
  "source-editor.select-line": "选择当前源码行",
}
