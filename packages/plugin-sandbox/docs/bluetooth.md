# Bluetooth background plugins

运行时提供接近 Web Bluetooth 的 BLE GATT API。插件通过消息启动连接；连接属于后台运行时，关闭调用它的页面不会自动断开。外部应用需要保持这个进程运行，并用 stdin/stdout 与之通信。默认仍有 30 秒运行期限，常驻模式必须传 `--max-duration-ms 0`。

这是 BLE Central/GATT 客户端能力。它可以读取传感器、写入控制特征、订阅设备数据；不提供经典蓝牙 A2DP 音箱音频投送、音频输出设备选择或媒体播放。那些能力需要独立的宿主音频 API。

## 不需要硬件的完整演示

在 `packages/plugin-sandbox` 目录运行（先按包 README 构建二进制）：

```sh
./bin/darwin-arm64/plugin-sandbox run examples/bluetooth.mjs \
  --listen --max-duration-ms 0 \
  --bluetooth-policy examples/bluetooth-policy.mock.json \
  --bluetooth-mock
```

输出 ready 后，逐行输入以下 JSON，每条后按回车：

```json
{"type":"list"}
{"type":"connect","id":"mock-battery"}
{"type":"status"}
{"type":"read"}
{"type":"disconnect"}
{"type":"stop"}
```

connect 会依次输出 connected、电量 85 和 subscribed，然后每隔约 500ms 收到模拟通知。status 返回 `connected: true`；disconnect 输出 disconnected 并停止通知；stop 清理并退出。list 只列出授权记录，不扫描无线电，也不保证设备当前在线。

模拟后端必须由宿主显式传 `--bluetooth-mock`，绝不会自动从真实 BLE 失败回退到模拟。模拟数据固定，只用于验证代码流程；它仍执行同一套设备、服务和读写权限检查。

## 使用真实设备

1. 让 BLE 设备处于可发现/广播状态。
2. 在支持蓝牙权限的终端里执行宿主发现命令：

   ```sh
   ./bin/darwin-arm64/plugin-sandbox bluetooth-scan --seconds 5
   ```

   每行输出 `{ "id": "...", "name": "...", "services": [...] }`。这条宿主命令只扫描，不连接。插件没有扫描接口。

3. 复制 `examples/bluetooth-policy.example.json` 为自己的权限文件，将 `id` 替换为扫描返回的精确 ID。macOS 的 ID 是 CoreBluetooth 标识符，不是可随意填写的 MAC 地址。不要按设备名称授权，名称只是宿主显示标签。ID 的稳定性取决于操作系统，不能作为密码学身份验证。
4. 根据设备实际提供的服务编辑权限，再运行：

   ```sh
   ./bin/darwin-arm64/plugin-sandbox run examples/bluetooth.mjs \
     --listen --max-duration-ms 0 \
     --bluetooth-policy /absolute/path/to/bluetooth-policy.json
   ```

5. 输入 `{"type":"connect","id":"扫描得到的精确 ID"}`。电量示例需要设备提供 Battery Service `0x180F` / Battery Level `0x2A19`。不支持该服务的设备需修改示例中的 UUID 和数据解析逻辑。具备 read 但没有 notify/indicate 的电量特征仍可按需读取。

原生实现使用 [btleplug](https://github.com/deviceplug/btleplug)。macOS 通过 CoreBluetooth 访问 BLE，操作系统可能要求给启动它的终端授予蓝牙权限；打包为应用时，宿主应用需包含 `NSBluetoothAlwaysUsageDescription`。Rust 权限文件不能替代系统权限。当前交付二进制为 macOS arm64，其他平台尚未构建验收。

## 宿主权限文件

```json
{
  "devices": [
    {
      "id": "EXACT_OS_DEVICE_ID",
      "name": "My battery sensor",
      "services": [
        {
          "uuid": "battery_service",
          "read": true,
          "notify": true,
          "write": false
        }
      ]
    }
  ]
}
```

- 没有 `--bluetooth-policy`：`getDevices()` 返回空数组，`getAvailability()` 返回 false，不初始化原生蓝牙适配器。
- 设备条目允许连接这个设备；services 只允许访问列出的服务。read/write/notify 默认 false，且在 Rust 的每次操作中复查。
- 一个服务的授权覆盖它的所有特征；当前没有特征级授权。如果一个服务包含危险控制特征，不要对整个服务授予 write。
- 所有未知字段、重复 ID/服务和非法 UUID 都在运行前拒绝。没有通配符，没有名称匹配授权。
- 权限文件由可信宿主提供，在启动时读取为不可变策略；插件不能修改。更换/撤销授权目前需要停止实例并以新策略重启。
- `--bluetooth-mock` 只选择模拟传输，不授予任何权限。`--allow-net` 与蓝牙无关。

## 插件代码

核心连接流程：

```js
const devices = await navigator.bluetooth.getDevices()
const device = devices.find((device) => device.id === message.id)
if (!device) throw new Error("Device is not granted by the host")

device.addEventListener("gattserverdisconnected", () => {
  postMessage({ type: "disconnected", id: device.id })
})

const server = await device.gatt.connect()
const service = await server.getPrimaryService("battery_service")
const battery = await service.getCharacteristic("battery_level")

const value = await battery.readValue() // DataView
postMessage({ percent: value.getUint8(0) })

battery.addEventListener("characteristicvaluechanged", (event) => {
  postMessage({ percent: event.target.value.getUint8(0) })
})
await battery.startNotifications()

// Later, in response to another message:
device.gatt.disconnect()
```

写入宿主已授予 write 的特征：

```js
await characteristic.writeValueWithResponse(new Uint8Array([1, 2, 3]))
// Only when the characteristic advertises writeWithoutResponse:
await characteristic.writeValueWithoutResponse(new Uint8Array([1]))
```

完整的 `examples/bluetooth.mjs` 包含命令串行执行、错误回传、设置失败后的断开、通知、状态和停止流程。宿主收到 JSON 消息后可以更新 Page View；cmdk 命令只需向同一后台进程写入对应 JSON 行。

## 生命周期和数据流

```mermaid
sequenceDiagram
  participant UI as Page View / cmdk
  participant JS as QuickJS plugin
  participant Rust as Rust BLE broker
  participant OS as OS Bluetooth / device
  UI->>JS: stdin JSON connect(deviceId)
  JS->>Rust: getDevices()
  Rust-->>JS: Host-granted records
  JS->>Rust: device.gatt.connect()
  Rust->>Rust: Check exact device grant
  Rust->>OS: Scan for ID, connect, discover GATT
  OS-->>Rust: Connected
  Rust-->>JS: Resolve connect; retain live resource
  JS->>Rust: startNotifications(service, characteristic)
  Rust->>Rust: Check service + notify permission
  Rust->>OS: Subscribe
  OS-->>Rust: Characteristic data
  Rust-->>JS: Bounded event queue, JS event callback
  JS-->>UI: stdout JSON postMessage
  UI->>JS: disconnect
  JS->>Rust: gatt.disconnect()
  Rust->>OS: Disconnect, release subscriptions
  Rust-->>JS: gattserverdisconnected
```

原生句柄和授权状态留在 Rust；JS 持有每次连接的 generation。断开/重连后，旧 service 和 characteristic 不能用于新连接，需重新获取。通知也携带 generation，过期通知会丢弃。

打开的连接独立保持运行时存活，即使 stdin EOF 或没有订阅。主动断开或远端掉线后移除存活资源；如果还有 stdin、定时器或其他连接，进程继续运行。远端断开通过宿主轮询发现（空闲时约 500ms）；正在进行的 GATT 操作可能使检测延迟。不会自动重连，插件可以自行决定是否重试。

`close()`、脚本异常和运行期限触发宿主清理。停止扫描及断开是有时限的 best effort；系统强杀、驱动失效和系统休眠不能保证执行异步清理。每次重新运行必须重新连接。

## API 范围

参考 [Web Bluetooth 规范](https://bluetooth.spec.whatwg.org/)，使用相同的对象层级、Promise、DataView、BufferSource 及事件名称。

| API                               | 支持范围                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| navigator.bluetooth.getDevices()  | 返回宿主已经授予的设备，不扫描、不弹窗                                                                                                              |
| getAvailability()                 | 已有授权时查询适配器是否开启；可能触发系统蓝牙权限                                                                                                  |
| requestDevice()                   | 报 NotSupportedError；没有 picker 或浏览器用户激活模型                                                                                              |
| BluetoothDevice                   | id、宿主提供的 name、gatt、gattserverdisconnected                                                                                                   |
| BluetoothRemoteGATTServer         | connected、device、connect、disconnect、getPrimaryService                                                                                           |
| BluetoothRemoteGATTService        | uuid、device、isPrimary、getCharacteristic                                                                                                          |
| BluetoothRemoteGATTCharacteristic | uuid、service、properties、value、readValue、writeValueWithResponse、writeValueWithoutResponse、startNotifications、stopNotifications               |
| BluetoothUUID                     | 32-bit 数字、UUID 字符串；常用别名 battery_service、battery_level、heart_rate、heart_rate_measurement、device_information、manufacturer_name_string |

与完整浏览器实现的差异：Web Bluetooth 暴露在 Window 中，本运行时在 worker 中提供它属于扩展；没有广告监听、描述符、复数查询、included services、配对管理、Permissions API、forget 或浏览器 GATT blocklist。没有实现完整 assigned-numbers 别名表；其他 UUID 请使用数字或规范字符串。不要将本能力模型当作浏览器 Web Bluetooth 安全策略的完整复现。

限制：最多 16 个授权设备、每设备 32 个授权服务、每连接 32 个订阅、512 个已发现特征；GATT 单值最多 512 字节（实际写入长度还受设备/平台 MTU 限制）；16 个待处理命令、32 条宿主事件和 32 条内部通知的有界队列。GATT 操作串行，单次最多 20 秒，连接扫描窗口最多 8 秒。繁忙时队列满会返回 QuotaExceededError。值的复制仍占用 JS turn 预算。

## 验证边界

```sh
cargo test -p eidos-plugin-sandbox --locked
# From packages/plugin-sandbox (macOS arm64):
python3 tests/bluetooth.py bin/darwin-arm64/plugin-sandbox
```

自动测试使用显式模拟传输，覆盖同一宿主权限检查、GATT 状态、读写、通知、消息触发、常驻、断开及旧对象失效；原生后端已编译进二进制。真实无线电、OS 授权、具体设备、距离/掉线及睡眠恢复行为仍需真实设备验收。
