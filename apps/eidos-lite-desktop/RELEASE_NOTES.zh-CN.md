## 改进

### 原生 Rust 运行时

这是一次专注于性能的更新。我们用 Rust 重写了 Eidos File 的运行时，Eidos Lite 从 0.40 起默认使用它。打开原有的 `.eidos` 文件就能用上新运行时，无需转换数据。

在桌面分组测试中，从点击视图到看到分组计数，中位耗时从 **1.82 秒降至 97 毫秒**。批量写入、文本搜索和读取首页也更快了。

[![Eidos Lite 0.40 中 JavaScript 与 Rust 的性能对比](https://media.eidos.space/releases/lite/0.40.0/runtime-performance/72df0a9da2afbe789d922a350c670f59f11b849bca09385402ab2dc1d57d29af/screenshot.webp)](https://media.eidos.space/releases/lite/0.40.0/runtime-performance/72df0a9da2afbe789d922a350c670f59f11b849bca09385402ab2dc1d57d29af/screenshot.webp)

### 切回 JavaScript

如果遇到兼容性问题，可以在 **设置 → 实验性 → 文件运行时** 中选择 **JavaScript**，重启 Lite 后即可切回旧运行时。欢迎把遇到的问题反馈给我们。如果 0.40 发布后没有收到新的兼容性问题反馈，我们计划在下一个版本移除旧的 JavaScript 运行时。
