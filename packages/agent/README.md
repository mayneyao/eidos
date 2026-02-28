# Eidos AI Agent

一个集成在 Eidos 中的智能 AI 代理库，支持通过多种消息平台（Telegram、Discord 等）进行对话交互。

## 功能特性

- ✅ **平台无关设计**: 核心逻辑与消息平台解耦
- ✅ **多平台支持**: 通过适配器模式支持多种平台
  - Telegram (已实现)
  - Discord (接口已定义，可扩展)
  - 其他平台（易于扩展）
- ✅ **AI 对话**: 使用自定义 LLM 进行智能对话
- ✅ **流式响应**: 实时流式更新消息
- ✅ **多用户会话**: 独立的用户会话管理
- ✅ **库模式**: 可作为库被其他应用引用

## 架构设计

### 核心层次

```
┌─────────────────────────────────────┐
│         Desktop/Host App            │
│    (提供 LLM 配置和平台选择)         │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│        @eidos.space/agent           │
│                                     │
│  ├─ Core                            │
│  │  ├─ SessionManager               │
│  │  ├─ AgentCreator                 │
│  │  └─ Commands (平台无关)          │
│  │                                  │
│  ├─ Platform Adapters               │
│  │  ├─ TelegramAdapter              │
│  │  ├─ DiscordAdapter               │
│  │  └─ [Your Custom Adapter]        │
│  │                                  │
│  └─ Types & Interfaces              │
│     └─ PlatformAdapter Interface    │
└─────────────────────────────────────┘
```

### 职责划分

#### 1. **Core 层** (`src/core/`, `src/agent/`)
- **职责**: 平台无关的核心逻辑
- **包含**:
  - `SessionManager`: 管理用户会话和 AI agents
  - `createAgent`: 创建和配置 LLM agents
  - `commands.ts`: 通用命令处理器（/start, /help, /reset, /stats）

#### 2. **Platform 层** (`src/platforms/`)
- **职责**: 特定平台的适配实现
- **实现 `PlatformAdapter` 接口**:
  - `start()`: 启动平台bot
  - `stop()`: 停止平台bot
  - `sendMessage()`: 发送消息
  - `updateMessage()`: 更新消息
  - `onMessage()`: 注册消息处理器
  - `onCommand()`: 注册命令处理器

#### 3. **Types 层** (`src/types/`)
- **职责**: 定义接口和类型
- **包含**:
  - `PlatformAdapter`: 平台适配器接口
  - `Message`: 平台无关的消息格式
  - `AgentConfig`: AI 配置
  - `UserSession`: 用户会话数据

## 作为库使用

### 基本用法

```typescript
import { startAgentBot, TelegramAdapter } from '@eidos.space/agent';
import type { AgentConfig } from '@eidos.space/agent';

// 1. 准备 AI 配置（从 eidos 设置中获取）
const agentConfig: AgentConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: 'your-api-key',
  systemPrompt: 'You are a helpful AI assistant.',
};

// 2. 创建平台适配器
const telegramAdapter = new TelegramAdapter('your-telegram-bot-token');

// 3. 启动 agent bot
const { platform, sessionManager, stop } = startAgentBot({
  agentConfig,
  platform: telegramAdapter,
  sessionTimeoutMinutes: 30,
});

// 4. 在应用退出时停止
process.on('SIGINT', async () => {
  await stop();
  process.exit(0);
});
```

### 使用便捷函数（Telegram）

```typescript
import { startTelegramBot } from '@eidos.space/agent';

const { platform, sessionManager, stop } = startTelegramBot({
  botToken: 'your-telegram-bot-token',
  agentConfig: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: 'your-api-key',
    systemPrompt: 'You are a helpful AI assistant.',
  },
});
```

### 在 Desktop 应用中集成

```typescript
// 从 eidos 配置中获取 LLM provider
interface EidosLLMProvider {
  type: string;
  apiKey: string;
  baseUrl?: string;
  models: string;
}

function createAgentConfig(provider: EidosLLMProvider): AgentConfig {
  const model = provider.models.split(',')[0].trim();
  return {
    provider: provider.type,
    model,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    systemPrompt: 'You are Eidos AI assistant.',
  };
}

// 启动 agent
const agentConfig = createAgentConfig(eidosLLMProvider);
const telegramAdapter = new TelegramAdapter(telegramBotToken);

const bot = startAgentBot({
  agentConfig,
  platform: telegramAdapter,
});
```

## 扩展新平台

### 步骤

1. **实现 `PlatformAdapter` 接口**

```typescript
import type { PlatformAdapter, Message } from '@eidos.space/agent';

export class YourPlatformAdapter implements PlatformAdapter {
  readonly name = "your-platform";

  async start(): Promise<void> { /* ... */ }
  async stop(): Promise<void> { /* ... */ }
  async sendMessage(userId: string, content: string): Promise<void> { /* ... */ }
  async updateMessage(userId: string, messageId: string, content: string): Promise<void> { /* ... */ }
  onMessage(handler: MessageHandler): void { /* ... */ }
  onCommand(command: string, handler: CommandHandler): void { /* ... */ }
}
```

2. **使用你的适配器**

```typescript
const yourAdapter = new YourPlatformAdapter(config);

startAgentBot({
  agentConfig,
  platform: yourAdapter,
});
```

### Discord 示例

参考 `src/platforms/discord/adapter.ts` 中的占位实现。

## API 文档

### `startAgentBot(config)`

启动 agent bot（支持任意平台）。

**参数:**
- `config.agentConfig` (AgentConfig): AI 配置
- `config.platform` (PlatformAdapter): 平台适配器
- `config.sessionTimeoutMinutes` (number, 可选): 会话超时，默认 30

**返回:**
- `platform`: 平台适配器实例
- `sessionManager`: SessionManager 实例
- `stop`: 停止函数

### `startTelegramBot(config)`

启动 Telegram bot 的便捷函数。

**参数:**
- `config.botToken` (string): Telegram bot token
- `config.agentConfig` (AgentConfig): AI 配置
- `config.sessionTimeoutMinutes` (number, 可选): 会话超时

### 类型导出

```typescript
import type {
  AgentConfig,
  UserSession,
  PlatformAdapter,
  Message,
  MessageHandler,
  CommandHandler,
} from '@eidos.space/agent';
```

## 项目结构

```
packages/agent/
├── src/
│   ├── index.ts              # 主 API 入口
│   ├── cli.ts                # CLI 入口（独立运行）
│   ├── types/
│   │   └── index.ts          # 接口和类型定义
│   ├── core/
│   │   └── commands.ts       # 平台无关的命令处理
│   ├── agent/
│   │   ├── ai-agent.ts       # AI agent 创建
│   │   └── session-manager.ts# 会话管理（平台无关）
│   ├── platforms/
│   │   ├── telegram/
│   │   │   └── adapter.ts    # Telegram 适配器
│   │   └── discord/
│   │       └── adapter.ts    # Discord 适配器（占位）
│   └── examples/
│       └── desktop-integration.ts
```

## 可用命令

所有平台都支持以下命令：

- `/start` - 启动机器人
- `/help` - 显示帮助
- `/reset` - 清空对话历史
- `/stats` - 查看会话统计

## 技术栈

- [grammy](https://grammy.dev/) - Telegram Bot 框架
- [@mariozechner/pi-ai](https://github.com/badlogic/pi-mono) - LLM API
- [@mariozechner/pi-agent-core](https://github.com/badlogic/pi-mono) - Agent 运行时

## 许可证

ISC
