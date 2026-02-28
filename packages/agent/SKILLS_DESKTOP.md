# Desktop 应用中使用 Skills

Skills 功能已经自动集成到 Eidos Desktop 应用的 Agent 中，无需额外配置即可使用。

## 工作原理

当你启动 Telegram Bot 时，Agent 会自动：

1. **加载 Skills**：从全局和 space 目录扫描并加载 skills
2. **添加到提示词**：将 skills 的名称、描述和路径添加到 agent 的系统提示词
3. **按需加载**：Agent 可以使用 `read_file` 工具随时加载完整的 skill 内容

## Skills 存放位置

### 全局 Skills（所有 space 可用）
```
~/.eidos/skills/
```

### Space 级别 Skills（仅特定 space 可用）
```
<space-path>/.eidos/skills/
```

**优先级**：Space skills **优先于**全局 skills（同名时 space 版本会覆盖全局版本）

## 如何创建和使用 Skill

### 1. 创建全局 Skill

```bash
# 创建目录
mkdir -p ~/.eidos/skills/my-first-skill

# 创建 SKILL.md 文件
cat > ~/.eidos/skills/my-first-skill/SKILL.md << 'EOF'
---
name: my-first-skill  
description: 演示如何创建和使用 skill 的示例
---

# 我的第一个 Skill

## 使用场景

当用户需要演示 skills 功能时使用此 skill。

## 指令

1. 向用户解释这是一个示例 skill
2. 展示 skill 的基本结构
3. 说明如何创建自己的 skill

## 示例响应

"✅ 这是 my-first-skill！Skills 功能已经正常工作。"
EOF
```

### 2. 重启 Agent

在 Desktop 应用中重启 Telegram Bot：

1. 打开设置
2. 进入 AI 配置
3. 在 Integrations 中禁用然后重新启用 Telegram Bot

或者直接重启 Eidos Desktop 应用。

### 3. 测试 Skill

向 Telegram Bot 发送消息：

```
你有哪些 skills？
```

Agent 会列出所有可用的 skills（包括你刚创建的 `my-first-skill`）。

然后测试使用：

```
使用 my-first-skill
```

Agent 会加载并执行这个 skill。

## 创建 Space 特定的 Skill

```bash
# 假设你的 space 路径是 ~/eidos-data/my-space
mkdir -p ~/eidos-data/my-space/.eidos/skills/space-automation

cat > ~/eidos-data/my-space/.eidos/skills/space-automation/SKILL.md << 'EOF'  
---
name: space-automation
description: 自动化此 space 的常见任务
---

# Space 自动化

## 任务

为这个特定 space 创建自动化工作流...
EOF
```

这个 skill 只在 `my-space` 中可用。

## 验证 Skills 已加载

查看 Electron 日志，应该能看到：

```
📚 Loaded 2 skill(s):
  - my-first-skill (global)
  - space-automation (space)
```

如果 space 和全局有同名 skill，会看到：

```
⚡ Skill "skill-name": space version overrides global
```

## 使用示例

### 示例 1：Eidos 自动化 Skill

可以使用项目自带的示例 skill：

```bash
# 链接示例 skill 到全局目录
ln -s /Users/mayne/workspace/eidos/packages/agent/examples/skills/eidos-automation \
      ~/.eidos/skills/eidos-automation
```

重启 Agent 后，向 Bot 发送：
```
帮我设置一个项目管理 space
```

Agent 会使用 `eidos-automation` skill 来创建表格。

### 示例 2：Git 工作流 Skill

创建一个辅助 Git 操作的 skill：

```bash
mkdir -p ~/.eidos/skills/git-workflow

cat > ~/.eidos/skills/git-workflow/SKILL.md << 'EOF'
---
name: git-workflow
description: 常用 Git 工作流自动化。用于提交、推送、分支管理等操作。
---

# Git 工作流

## 常用命令

### 快速提交
```bash
git add . && git commit -m "{用户提供的消息}" && git push
```

### 创建功能分支
```bash
git checkout -b feature/{分支名}
```

### 同步主分支
```bash
git checkout main && git pull origin main
```

## 最佳实践

1. 提交前检查状态：`git status`
2. 提交消息要清晰描述变更
3. 推送前先拉取最新代码
EOF
```

使用：
```  
提交所有更改，消息是 "添加 skills 功能"
```

Agent 会使用 git-workflow skill 来执行操作。

## 注意事项

1. **Skills 缓存**：Skills 在 Agent 启动时加载并缓存，修改 skill 文件后需要重启 Agent

2. **安全性**：Skills 可以执行任何命令，请谨慎使用来自外部来源的 skills

3. **优先级**：同名时 space skills 优先级高于全局 skills

4. **调试**：查看 Electron 日志（Help → Toggle Developer Tools）可以看到 skills 加载情况

## 更多信息

完整的 skills 文档请参考：
- [packages/agent/SKILLS.md](file:///Users/mayne/workspace/eidos/packages/agent/SKILLS.md)
- [示例 skills](file:///Users/mayne/workspace/eidos/packages/agent/examples/skills/)

## 总结

Skills 功能已经**开箱即用**，你只需要：

1. ✅ 在 `~/.eidos/skills/` 或 `<space>/.eidos/skills/` 创建 SKILL.md 文件
2. ✅ 重启 Agent（重启 Telegram Bot）
3. ✅ 开始使用！

无需修改任何代码，skills 会自动被发现和加载。🎉
