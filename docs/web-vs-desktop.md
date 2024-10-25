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

## Limitations of the web version

### Requirements

Currently, Eidos only supports the latest version of chromium-based browsers, such as Chrome, Edge, Arc, and Brave. It recommends a version greater than 122.

Safari, Firefox, and other browsers are not tested yet.

### Why?

Eidos is built on sqlite-wasm and requires browser support for OPFS[1] to work.

Storing data in a local folder is a good practice to ensure better data security. With Chrome 122 and its later versions, we can get persistent permissions[2] for local folders, so we do not have to select a folder every time we open the web app.

1. https://sqlite.org/wasm/doc/trunk/persistence.md#opfs
2. https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
