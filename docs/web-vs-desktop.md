# Differences Between Desktop and Web Versions

The web app serves as a technology preview, incorporating several cutting-edge solutions such as OPFS and sqlite-wasm. However, due to browser environment limitations, the web version has some drawbacks and requires more recent browser versions.

The desktop version is built using Electron, primarily adapting the file system and SQLite. It utilizes native SQLite as its computation engine, offering better performance and more stable system permissions compared to the web version.

## Key differences

<!-- Feature comparison table -->

| Feature                      | Desktop | Web |
| ---------------------------- | ------- | --- |
| CJK Full-text Search         | ✅      | ❌  |
| WebLLM                       | ❌      | ✅  |
| Real-time Local Data Updates | ✅      | ❌  |
| Built-in API Service         | ✅      | ❌  |

- In the web version, data is stored in OPFS. If native file storage is selected, it periodically syncs to a local folder. Consequently, the SQLite data in the local folder may have some latency. The desktop client doesn't have this issue.
- The desktop version has removed support for WebLLM. For offline LLM solutions, users can run local options like Ollama or LLM-Studio.
- The desktop version has built-in API services, while the web version does not.
