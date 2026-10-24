# plugin-sandbox

独立的 Rust + QuickJS 命令行运行器，版本 0.3.0。无需 Eidos、Node.js 或 Electron 即可运行一个打包后的 JavaScript ES Module。

这是运行时原型：实现受限的宿主接口、QuickJS 堆/栈限制和执行预算；**尚未实现 OS 级沙箱，不用于安全执行敌对代码**。QuickJS 的原生引擎漏洞、原生调用阻塞和进程资源隔离不由这些限制完整覆盖。

## 直接运行

以下命令从 `packages/plugin-sandbox` 目录执行；构建方式见包 README。

交付二进制：`bin/darwin-arm64/plugin-sandbox`（macOS Apple Silicon）。

```sh
./bin/darwin-arm64/plugin-sandbox --version
./bin/darwin-arm64/plugin-sandbox run examples/hello.mjs
```

日志写入 stderr，`postMessage` 每次向 stdout 输出一行 JSON，方便外部应用集成。

```text
[log] Hello from QuickJS
{"type":"ready","engine":"QuickJS","value":42}
```

输入消息：

```sh
printf '%s\n' '{"hello":"世界"}' | ./bin/darwin-arm64/plugin-sandbox run examples/echo.mjs --listen
```

交互后台：

```sh
./bin/darwin-arm64/plugin-sandbox run examples/background.mjs --listen --max-duration-ms 0
```

后台每秒输出一条 tick。输入 `{"type":"status"}` 回车查看状态，输入 `{"type":"stop"}` 回车停止。Ctrl-C 也能结束整个进程。

## 编写插件代码

入口是普通 ES Module，执行模块顶层代码，支持 top-level await。默认导出不会被自动调用；当前 Eidos 的 mount/activate 插件需要单独的宿主适配，不可直接使用。

```js
let count = 0

onmessage = async ({ data }) => {
  if (data.type === "increment") {
    await new Promise((resolve) => setTimeout(resolve, 10))
    postMessage({ count: ++count })
  }
  if (data.type === "stop") close()
}
```

TypeScript 和多文件项目需先编译、打包成一个 ESM 文件。运行时没有 npm 解析器或模块加载器，外部及本地 imports 均不提供。

## API 范围

| 已实现                                          | 行为                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| ECMAScript、Promise、ES Module                  | QuickJS 提供；包含 top-level await                                                |
| console.log/info/warn/error/debug               | 输出到 stderr                                                                     |
| setTimeout / clearTimeout                       | 函数回调和额外参数                                                                |
| setInterval / clearInterval                     | 重复任务，最小重复间隔 1ms                                                        |
| queueMicrotask                                  | Promise 驱动的最小实现                                                            |
| self / onmessage                                | 标准输入 JSON 行转为 message 事件                                                 |
| addEventListener / removeEventListener          | 仅 message + 函数监听器；不支持 options                                           |
| postMessage                                     | JSON 序列化输出；不是完整 structured clone                                        |
| close                                           | 关闭当前实例、清理计时器、取消请求并释放连接                                      |
| fetch / Request / Response / Headers            | HTTP(S)、请求头、文本/JSON/二进制 body、clone、重定向                             |
| WebSocket                                       | WS(S)、文本/二进制、子协议、事件、关闭握手、bufferedAmount                        |
| AbortController / AbortSignal                   | 请求取消、abort(reason)、timeout(ms)                                              |
| Blob / TextEncoder / TextDecoder                | 缓冲二进制数据、UTF-8 编解码                                                      |
| EventTarget / Event / MessageEvent / CloseEvent | 网络对象事件；全局 message 接口仍使用上面的简化实现                               |
| navigator.bluetooth / BluetoothUUID             | 宿主已授权设备、BLE GATT 连接、服务和特征、DataView 读值、BufferSource 写入、通知 |

此版本提供 Web 标准常用接口的受限实现，不宣称完整 Web Worker / Fetch / WebSocket / Web Bluetooth 标准兼容，也尚未跑 WPT。没有音频、DOM、Node API、文件访问 API、Web Crypto 或 Streams。`postMessage` 仍为 JSON 协议；网络连接支持二进制。`queueMicrotask` 的未捕获异常作为未处理 Promise rejection 报错退出。

## 蓝牙：消息触发、宿主授权、连接保持常驻

参见 [完整蓝牙指南](bluetooth.md)。运行无需硬件的完整示例：

```sh
./bin/darwin-arm64/plugin-sandbox run examples/bluetooth.mjs \
  --listen --max-duration-ms 0 \
  --bluetooth-policy examples/bluetooth-policy.mock.json \
  --bluetooth-mock
```

随后逐行输入消息：

```json
{"type":"list"}
{"type":"connect","id":"mock-battery"}
{"type":"status"}
{"type":"read"}
{"type":"disconnect"}
{"type":"stop"}
```

启动时只输出 ready，不连接设备。connect 后读取电量并订阅通知，连接本身保持运行时存活。去掉 `--bluetooth-mock` 并换成真实设备权限文件即可使用原生 BLE 后端；宿主使用 `bluetooth-scan --seconds 5` 查找设备 ID。默认未授权任何蓝牙设备。

`navigator.bluetooth.getDevices()` 只返回宿主已授权设备。`requestDevice()` 不可用：这个无 UI 的宿主没有浏览器设备选择器，插件不能自行扩大授权。可信宿主可为单个设备设置 `allServices: true`（同时提供 `services: []`）以授权全部 GATT 服务及操作，或通过 `services` 限制服务及 read/write/notify。Lite 的 `bluetooth: true` 经设备选择授权后转换为前者。Web Bluetooth 原本面向 Window；在本 worker 中暴露它是宿主扩展。

## 网络权限由宿主授予

默认禁止所有网络访问。`--allow-net` 可以重复，接受精确 origin（协议、主机和有效端口），或由可信宿主传入 `--allow-net '*'` 允许公网 HTTPS/WSS；不接受路径和部分域名通配符。通用授权不包含明文 HTTP/WS，也不会取消私网地址检查。HTTP 和 WS 是不同的精确授权项。插件无法自行授权，也不会弹出授权窗口。

```sh
./bin/darwin-arm64/plugin-sandbox run plugin.mjs \
  --allow-net https://api.example.com \
  --allow-net wss://events.example.com
```

本地、内网及保留地址还必须传 `--allow-private-net`；这个开关自身不授予任何 origin。授权意味着允许访问该 origin 的所有路径。请由可信宿主生成参数，不要直接接受插件声明作为授权结果。

Rust broker 在 DNS 前检查 origin，解析后检查 IP，并将已检查的地址固定用于连接。HTTP 重定向每一跳重新检查；跨 origin 重定向移除 Authorization。忽略环境代理，不使用 Cookie jar，不提供原始 socket 或 TLS 验证关闭开关。HTTPS/WSS 使用 rustls 与 Web PKI 根证书；不自动读取系统自定义证书。

### WebSocket 示例

在项目根目录的第一个终端启动本地测试服务（Python 标准库，无需安装依赖）：

```sh
python3 examples/websocket-server.py
```

另一个终端运行插件：

```sh
./bin/darwin-arm64/plugin-sandbox run examples/websocket.mjs \
  --allow-net ws://127.0.0.1:8787 --allow-private-net
```

插件连接后发送 JSON，收到回显后主动正常关闭：

```js
const socket = new WebSocket("ws://127.0.0.1:8787/echo", "echo")
socket.onopen = () =>
  socket.send(JSON.stringify({ message: "Hello from QuickJS" }))
socket.onmessage = ({ data }) => {
  postMessage(JSON.parse(data))
  socket.close(1000, "done")
}
socket.onclose = ({ code, wasClean }) => postMessage({ code, wasClean })
```

`examples/websocket.mjs` 包含完整事件处理。打开的 WebSocket 会保持运行时存活；长期运行还需要 `--max-duration-ms 0`。可在 `onmessage` 中接收 UI/命令端的 JSON 输入后调用 `socket.send()`，并通过 `postMessage` 返回结果；外部应用通过 stdin/stdout 管道接入即可。

同一服务也支持 fetch 示例：

```sh
./bin/darwin-arm64/plugin-sandbox run examples/fetch.mjs \
  --allow-net http://127.0.0.1:8787 --allow-private-net
```

### 网络兼容范围及限额

- `fetch` 收到响应头即 resolve。`.body` 为 ReadableStream，按需拉取最多 16 KiB 的块并支持背压、取消和 SSE。`text()`、`json()`、`arrayBuffer()`、`bytes()`、`blob()`、`formData()` 和 `clone()` 可用。缓冲读取最多 16 MiB，还受 JS 堆和单轮 CPU 配额约束；大响应应逐块消费。始终消费或取消 body。
- 请求 body 支持字符串、Blob/File、ArrayBuffer、TypedArray、FormData、URLSearchParams、ReadableStream。当前上传先缓冲，最多 1 MiB，不是流式上传传输。URL 需为绝对地址，没有浏览器基准 URL。
- 支持 `redirect: follow/error/manual`、AbortSignal（包括 any/timeout）、HTTP 错误状态响应和 SHA-256/384/512 integrity。没有浏览器 origin/CORS 检查、Cookie、凭据存储、持久缓存或 Service Worker；credentials/cache/referrer 不授予环境权限。宿主 origin 授权是访问控制依据，Authorization 需显式设置。
- Headers 操作及网络响应头不可修改约束已实现；禁止的请求头由 Rust 过滤。UTF-8 TextDecoder 支持分块解码，也提供 TextDecoderStream/TextEncoderStream。通用 Streams 与 URL/URLSearchParams 使用固定版本 polyfill；运行 `pnpm --filter @eidos.space/plugin-sandbox build:web` 生成内嵌文件，`check:web` 检查是否过期。依赖许可证见 `crates/eidos-plugin-sandbox/src/generated-web-NOTICE.txt`。
- WebSocket 支持 `open/message/error/close`、字符串或 BufferSource/Blob 的 send、`binaryType: blob/arraybuffer`、子协议、readyState 常量和关闭码验证。没有自动重连、扩展协商或握手重定向。发送队列满时抛异常，是当前资源限额行为。
- 最多 16 个并发网络资源；HTTP 上传 / WS 消息最多 1 MiB；响应流没有原来的 1 MiB 总量上限。WS 发送缓冲最多 4 MiB，命令队列 32 条；宿主事件队列 32 条。输入 header 最多 128 个、32 KiB；响应 header 读取后检查 32 KiB。
- HTTP 从开始请求到最终响应头共用 30 秒截止时间，包含 DNS、连接及全部重定向；连接本身最多 10 秒。读取等待及未消费 body 的空闲截止时间分别为 30 秒；最多 20 次重定向。活跃的 SSE 可超过 30 秒。WebSocket 建连、单次写入和关闭握手超时 10 秒，已连接的空闲 socket 不设网络层超时。
- 网络等待不占用 JS turn 预算。大体积数据的编码/复制仍占用 JS turn，需要时提高 `--turn-budget-ms`。宿主网络缓冲不计入 QuickJS 堆限制。

### 内部数据流

```text
插件 fetch() / new WebSocket()
  → 嵌入的 web.js 标准接口层
  → 私有 native bridge（JSON，插件不可直接访问）
  → Rust Network broker：参数校验 → origin 授权 → DNS/IP 检查
  → Tokio 异步 I/O → reqwest / tungstenite → TCP / TLS
  → 有界事件队列 → 唤醒主线程
  → QuickJS 单线程事件分发 → Promise / WebSocket 回调
```

策略和连接句柄留在 Rust；JavaScript 只持有不透明资源 ID。`close()`、进程退出或运行失败会取消资源。权限 broker 是运行时能力边界，仍不能替代进程级 OS 沙箱。

## 生命周期与限额

- 默认在模块完成、所有定时器、网络和蓝牙资源结束且没有输入需要等待时退出。
- `--listen` 在 stdin 保持打开时等待消息；stdin EOF 后继续执行已有定时器、网络和蓝牙资源，然后退出。
- `close()` 停止 JS 任务并取消网络资源；蓝牙宿主执行有时限的停止扫描和断开清理。进程退出时清理同样会执行，OS 强杀除外。
- 默认整个运行最多 30 秒；常驻任务传 `--max-duration-ms 0`。
- 默认每次 JS 执行及其微任务 checkpoint 共用 100ms 墙钟预算，微任务数上限 10,000。预算不是精确 CPU 计量，也不是可抢占的 OS 限额。
- QuickJS 堆默认 64 MiB，栈 512 KiB。宿主缓冲不计入 JS 堆，另有输入/输出上限。
- 最多 1,024 个定时器；模块最多 4 MiB；单条输入/输出最多 1 MiB；输入队列最多 8 条。
- 输出没有生命周期累计上限。每个一秒窗口内消息最多 16 MiB，超限终止运行；日志独立限制为每窗口 1 MiB，超额日志丢弃。Node SDK 另外限制每条输出管道为每秒 32 MiB。输出通过有界管道产生背压，不在宿主累计保存全部历史消息。
- 非法输入、脚本异常、未处理 rejection、资源超限返回非零退出码。不会自动重启或重试副作用。
- message handler 的异步任务可以交错执行，调用方需要自行处理命令串行化。

```sh
./bin/darwin-arm64/plugin-sandbox run plugin.mjs \
  --memory-mb 32 \
  --turn-budget-ms 50 \
  --max-duration-ms 5000
```

## 构建和验证

```sh
# From the monorepo root:
pnpm --filter @eidos.space/plugin-sandbox build:native
cargo test -p eidos-plugin-sandbox --locked
cargo fmt --all --check
cargo clippy -p eidos-plugin-sandbox -p eidos-plugin-sandbox-cli --all-targets --locked -- -D warnings
# From packages/plugin-sandbox (macOS arm64):
python3 tests/smoke.py bin/darwin-arm64/plugin-sandbox
python3 tests/network.py bin/darwin-arm64/plugin-sandbox
python3 tests/bluetooth.py bin/darwin-arm64/plugin-sandbox
```

`tests/smoke.py` 对真实可执行文件验证消息、异步定时器、后台空闲与停止、死循环、无限微任务、内存限额、非法输入、输出限额和错误传播。它不构成敌对代码安全审计。

`tests/network.py` 使用本机临时 TCP 端口验证 HTTP/WS 收发、二进制、取消、关闭、限额、默认拒绝、内网双重授权和重定向。无需公网；需要允许监听 loopback。它不替代 TLS 互操作性测试或完整协议符合性测试。

`tests/bluetooth.py` 显式使用模拟 BLE 后端，验证同一 Rust 权限路径和 JavaScript/消息生命周期。它不操作真实无线电，也不代表已经通过真实设备、macOS 蓝牙权限或跨平台验收。

二进制依赖系统库，但不依赖源目录或外部 JavaScript 文件来加载运行时 bootstrap；bootstrap 已嵌入二进制。其他平台需要单独编译和验收。
