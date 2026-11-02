# Firefox DevTools MCP

English | [简体中文](README.zh-CN.md)

[![CI](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT%20%2F%20Apache--2.0-blue.svg)](#许可)

基于 WebDriver BiDi 的 Firefox MCP (Model Context Protocol) 服务端，支持 AI 智能体（Claude、Cursor、Codex 等）自动化控制与审查 Firefox。

> **说明**：本项目是 [mozilla/firefox-devtools-mcp](https://github.com/mozilla/firefox-devtools-mcp) 的独立增强 Fork 版本，解锁了全部内置模块并提供开箱即用构建产物。非 Mozilla 官方仓库。

---

## Fork 特性差异

相较于上游官方包 `@mozilla/firefox-devtools-mcp`：
- **完整编译 5 个可选模块**：默认编译进 `prefs`、`privileged`、`launch`、`bidi` 和 `stealth` 模块（官方包会剥离这些模块）。
- **内置 `stealth-cli` 反反爬工具**：直接对 `xul.dll` / `libxul.so` 打二进制补丁，将 `navigator.webdriver` 强制修改为 `false`。
- **免构建预编译包**：提供 GitHub Releases 压缩包和 Claude Desktop 专属 `.mcpb` 扩展包，无需依赖 npm 或本地编译。

## 环境要求

- **Node.js**：≥ 20.19.0
- **Firefox**：100+（若需执行 `evaluate_script` 或日志断点需 153+）
- Windows 会自动探测已安装的 Firefox；便携版或自定义路径请通过 `--firefox-path` 指定。

---

## 快速上手

### 1. 获取并部署

**方式 A：下载预编译包（推荐）**
从 [Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases) 下载最新的 `firefox-devtools-mcp-vX.Y.Z.tar.gz`：
```bash
mkdir firefox-devtools-mcp && cd firefox-devtools-mcp
tar -xzf path/to/firefox-devtools-mcp-vX.Y.Z.tar.gz -C .
npm install --omit=dev
```

**方式 B：Claude Desktop 扩展（.mcpb）**
从 [Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases) 下载 `firefox-devtools-mcp-X.Y.Z.mcpb`，双击即可直接安装至 Claude Desktop。

**方式 C：源码编译**
```bash
git clone https://github.com/LTHPKBTE/firefox-devtools-mcp
cd firefox-devtools-mcp
npm install
npm run build:moz
# 输出入口文件为 dist.moz/index.js
```

### 2. 配置 MCP 客户端

服务端基于 `stdio` 通信。将 `/path/to/dist/index.js` 替换为本地实际绝对路径。

#### Claude Code (CLI)
```bash
claude mcp add firefox-devtools node /path/to/dist/index.js -- --auto-profile
```

#### JSON 配置文件 (Claude Desktop, Cursor, Cline)
```json
{
  "mcpServers": {
    "firefox-devtools": {
      "command": "node",
      "args": [
        "/path/to/dist/index.js",
        "--auto-profile",
        "--viewport", "1280x720"
      ]
    }
  }
}
```

*Windows 用户注意*：路径请使用正斜杠（`C:/tools/dist/index.js`）或双反斜杠（`C:\\tools\\dist\\index.js`）。

#### 调试验证 (MCP Inspector)
```bash
npx @modelcontextprotocol/inspector node /path/to/dist/index.js --headless --start-url https://example.com
```

---

## 进阶指南

### 接管已打开的 Firefox

让 AI 智能体直接操作你日常浏览中的标签页、登录态与 Cookie，而无需启动空白浏览器。

1. **关闭测试配置覆盖**：在目标 Firefox 配置文件的 `about:config` 中，将 `remote.prefs.recommended` 设为 `false`（或写入配置文件的 `user.js` 中），防止浏览器被重置测试偏好。
2. **带调试参数启动 Firefox**：
   ```bash
   firefox --marionette --remote-debugging-port
   ```
3. **启动 MCP 服务端挂载**：
   ```bash
   node dist/index.js --connect-existing --marionette-port 2828
   ```

> **注意**：开启 `--marionette` 会使 `navigator.webdriver = true`，容易触发 Cloudflare/Akamai 风控。日常使用请重启浏览器去掉参数，或使用下方 Stealth 补丁。

### 反爬特征隐藏 (`stealth-cli`)

`navigator.webdriver` 属于浏览器底层属性，无法通过页面脚本彻底篡改。`stealth-cli` 负责修改浏览器动态链接库（Windows 为 `xul.dll`，Linux 为 `libxul.so`），强制将其返回值篡改为 `false`。

需要**以管理员/root 身份打开终端**，并在**关闭 Firefox** 后执行：

```bash
# 检查当前补丁状态
node dist/stealth-cli.js status

# 打补丁（如果是自定义/便携版浏览器，需手动传参路径）
node dist/stealth-cli.js patch --firefox-path "C:\Program Files\Waterfox"

# 还原官方原版库文件
node dist/stealth-cli.js restore --firefox-path "C:\Program Files\Waterfox"

# 清理已过期的旧版本升级备份
node dist/stealth-cli.js prune
```
底层修改机制与字节签名详情：[docs/stealth.md](docs/stealth.md)。

### Firefox for Android

支持通过 ADB 调试 Android 设备上的 Firefox。

> **警告**：Android 模式每次会话前都会强制清空应用数据（`pm clear`）。请使用专门用于自动化的测试浏览器，切勿绑定日常使用的移动端浏览器。

```bash
# 自动检测单台设备
node dist/index.js --android-device auto --android-wipe-app-data

# 指定序列号及目标应用包名
node dist/index.js --android-device <serial> --android-package org.mozilla.fenix --android-wipe-app-data
```

### 将大体积输出直接落盘 (`saveTo`)

防止 DOM 快照或截图撑爆大语言模型的上下文窗口：

```javascript
// 支持该参数的工具示例：
screenshot_page({ saveTo: "page.png" })
take_snapshot({ saveTo: true }) // 默认保存至 ~/.firefox-devtools-mcp/output/
evaluate_script({ function: "() => performance.getEntries()", saveTo: true, preview: 1000 })
```

---

## CLI 参数参考

| 参数 | 对应环境变量 | 说明 |
| :--- | :--- | :--- |
| `--firefox-path <path>` | - | Firefox 可执行文件或安装目录路径 |
| `--headless` | `FIREFOX_HEADLESS=true` | 无头模式（无 GUI 窗口运行） |
| `--viewport <宽x高>` | - | 初始视口尺寸（如 `1280x720`） |
| `--auto-profile` | `AUTO_PROFILE=true` | 启用并复用持久化用户配置（位于 `~/.firefox-devtools-mcp/`） |
| `--profile-path <path>` | - | 指定自定义用户配置文件路径 |
| `--connect-existing` | `CONNECT_EXISTING=true` | 接管已运行的 Firefox 实例，而非启动新实例 |
| `--marionette-port <端口>`| `MARIONETTE_PORT` | 接管模式使用的端口（默认：`2828`） |
| `--tool-preset <预设>` | `TOOL_PRESET` | 工具预设：`slim`, `basic` (默认), `developer`, `mozilla`, `all` |
| `--tools <列表...>` | - | 显式声明开启的模块列表（覆盖 `--tool-preset`） |
| `--pref <键=值>` | - | 启动时注入 Firefox 首选项（可重复声明） |
| `--unrestricted-save-paths`| `UNRESTRICTED_SAVE_PATHS`| 允许 `saveTo` 写入沙箱之外的任意系统路径 |
| `--log-file <path>` | - | 将标准错误输出日志重定向写入文件 |

### 工具预设分组

- `slim`：基础页面交互工具集（`pages`）。
- `basic`（默认）：常规浏览 + `evaluate_script` 脚本执行。
- `developer`：增加 `network`、`console`、`debugging`、`profiler`。
- `mozilla`：增加特权访问 `privileged` 和首选项 `prefs`（需配合 `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`）。
- `all`：包含全部工具模块（含运行时修改 stealth 补丁的工具）。

完整 API 及工具参数清单：[docs/tools.md](docs/tools.md)。

---

## 常见问题排查

- **找不到 Firefox 路径**：显式指定路径，如 `--firefox-path "C:\Program Files\Mozilla Firefox\firefox.exe"`。
- **UID 失效（Stale UIDs）**：页面跳转或 DOM 元素重绘后旧 UID 废弃。重新调用 `take_snapshot` 即可。
- **Windows 下报连接关闭错误 (`-32000`)**：在客户端配置的 `command` 中使用 `cmd /c` 包裹启动：
  ```json
  "command": "cmd",
  "args": ["/c", "node", "C:\\tools\\dist\\index.js"]
  ```

## 许可

提供 [MIT](LICENSE-MIT) 与 [Apache 2.0](LICENSE-APACHE) 双重许可，任选其一。