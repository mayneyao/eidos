// 示例：如何使用 MentionPlugin 的 onDeleteCallback

import NewMentionsPlugin from "./index"

function ExampleUsage() {
  const handleMentionDelete = (nodeId: string) => {
    console.log("提及节点被删除:", nodeId)
    // 在这里可以执行一些清理工作，比如：
    // 1. 更新相关文档的引用计数
    // 2. 通知其他组件此提及已被删除
    // 3. 保存到日志中
    // 4. 触发重新渲染相关组件
  }

  const handleMentionSelect = (selectedOption: any) => {
    console.log("选择了提及:", selectedOption)
  }

  return (
    <NewMentionsPlugin
      onDeleteCallback={handleMentionDelete}
      onOptionSelectCallback={handleMentionSelect}
      placement="bottom-start"
    />
  )
}

export default ExampleUsage
