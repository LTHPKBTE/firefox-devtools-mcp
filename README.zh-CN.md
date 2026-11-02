# Firefox DevTools MCP

English | [简体中文](README.zh-CN.md)

> **这不是 Mozilla 的仓库。** 本 fork 位于
> [LTHPKBTE/firefox-devtools-mcp](https://github.com/LTHPKBTE/firefox-devtools-mcp)，构建的是
> 全工具集版本，包含用于检查 Firefox 特权层的 Mozilla 专用模块。上游项目是
> [mozilla/firefox-devtools-mcp](https://github.com/mozilla/firefox-devtools-mcp)，本 fork 所基于的
> 代码、上游的发布以及官方 `@mozilla/firefox-devtools-mcp` 包均由它维护。
>
> **问题该提在哪里。** 如果你运行的是本仓库构建的版本——Release tar 包、`.mcpb` 扩展、CI 产物，
> 或你自己 `npm run build:moz` 的结果——请提到[本仓库的 issues](https://github.com/LTHPKBTE/firefox-devtools-mcp/issues)，
> 并说明构建来源。上游追踪器只接受使用上游分发版本、并在该版本上复现过的问题：本 fork 改动导致的
> 问题在上游无法复现，报告过去也无法处理。

[![CI](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE-MIT) [![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE-APACHE)

Model Context Protocol（MCP）服务器，让 AI agent 能够使用 Firefox。主要有两种用途：

- **Agent 浏览网页**：agent 用浏览器完成日常任务，例如读取页面、填写表单、走完多步流程。
- **Agent 辅助 Web 开发**：agent 打开你正在开发的页面，用开发者工具检查它，例如控制台、网络请求、调试器和性能分析器。

它通过 WebDriver BiDi（经由 Selenium WebDriver）控制 Firefox，可与 Claude Code、Claude Desktop、Cursor、Cline 等 MCP 客户端配合使用。

本仓库：https://github.com/LTHPKBTE/firefox-devtools-mcp

上游：https://github.com/mozilla/firefox-devtools-mcp

> **注意**：本服务器需要本地安装 Firefox，无法运行在 glama.ai 这类云端托管服务上。请从[安装](#安装)读起：审计源码后自行构建，或使用本仓库构建好的产物。上游的公共构建（不含 Mozilla 专用模块）见[上游 README](https://github.com/mozilla/firefox-devtools-mcp#readme)。

## 安全

浏览器 MCP 服务器本身带有风险，几条关键做法：

- **使用独立的 Firefox 配置文件。** 不要让服务器跑在你的日常配置文件上——浏览器能访问的东西 agent 都能访问，包括 cookie 和已保存的会话。`--connect-existing` 是为"就要用你自己会话"的场景准备的：它给 agent 同样的访问范围，所以要有意识地使用，并只在会话期间启用，见[连接到已有 Firefox](#连接到已有-firefox)。
- **谨慎选择访问的站点。** 页面可能返回专门操纵 agent 的内容（提示注入）。只去你自己控制的或信任的站点。
- **只开启需要的工具模块。** 默认的 `basic` 预设已包含 `evaluate_script`；`--tool-preset slim` 会去掉它。更高的预设，例如 `--tool-preset developer`（调试、网络、控制台、性能分析）和 `--tool-preset mozilla`（特权上下文），会进一步扩大 agent 的能力。

完整风险说明与漏洞上报方式见 [SECURITY.md](SECURITY.md)。

## 环境要求

- Node.js ≥ 20.19.0
- 已安装 Firefox 100+（会自动探测，也可用 `--firefox-path` 指定）

## 安装

**先审计源码，再自行构建。** 这个服务器会驱动你的浏览器，`stealth` 命令还会改写 Firefox 安装目录里的文件，所以运行之前值得先读一遍代码。克隆仓库、读 `src/`，然后构建：

```bash
git clone https://github.com/LTHPKBTE/firefox-devtools-mcp
cd firefox-devtools-mcp
npm install
npm run build:moz
node dist.moz/index.js --auto-profile
```

测试套件与其他脚本见[从源码构建](#从源码构建)。

下面提到的预构建产物由本仓库的 GitHub Actions 从对应 tag 的源码构建，可以先和代码对照再运行。

本项目不做任何系统级安装；反向操作的步骤见[卸载](#卸载)：撤销浏览器补丁、移除客户端条目、删除解包目录与数据目录。

### 安装预构建版本

本 fork 不发布到 npm 或 MCP registry（那些名字属于上游），因此一切都由 GitHub Actions 构建、从 GitHub 下载：

- **Release** —— [Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases)，推送 `vX.Y.Z` tag 时创建：
  - `firefox-devtools-mcp-vX.Y.Z.tar.gz` —— 全工具集构建，适用于任何 MCP 客户端
  - `firefox-devtools-mcp-X.Y.Z.mcpb` —— Claude Desktop 扩展，双击安装
- **最新的 `main` 构建** —— Actions → [CI](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml) → 最近一次运行 → *Artifacts* → `dist.moz/`。需要 GitHub 账号，且 7 天后删除。

从 tar 包安装：

```bash
mkdir firefox-devtools-mcp
tar -xzf firefox-devtools-mcp-v0.10.7.tar.gz -C firefox-devtools-mcp
cd firefox-devtools-mcp
npm install --omit=dev
node dist/index.js --auto-profile             # MCP 服务器（stdio）
node dist/stealth-cli.js status               # 可选：二进制补丁命令
```

然后让客户端指向那个绝对路径，例如 Claude Code：

```bash
claude mcp add firefox-devtools node /absolute/path/to/firefox-devtools-mcp/dist/index.js -- --auto-profile
```

`.tar.gz` 里包含 `dist/`、`package.json` 以及两个 README，因此 `npm install --omit=dev` 是唯一额外的步骤；`dist/stealth-cli.js` 和浏览器端脚本 `dist/snapshot.injected.global.js` 都在其中。预设的用法见后文，其中 `--tool-preset all` 才会暴露 `stealth` 工具。

本文后续命令按 Release 的目录结构写成 `dist/index.js`。用 `npm run build:moz` 自行构建时输出的是 `dist.moz/index.js`，路径请相应调整。

## 客户端注册

服务器用 stdio 通信，任何 MCP 客户端都能运行它。客户端需要 `dist/index.js` 的绝对路径（自己构建的仓库则是 `dist.moz/index.js`）。

### Claude Code

```bash
claude mcp add firefox-devtools node /absolute/path/to/dist/index.js

# 通过参数指定无头模式与视口
claude mcp add firefox-devtools node /absolute/path/to/dist/index.js -- --headless --viewport 1280x720

# 或者通过环境变量
claude mcp add firefox-devtools node /absolute/path/to/dist/index.js \
  --env START_URL=https://example.com \
  --env FIREFOX_HEADLESS=true
```

### Codex

```bash
codex mcp add firefox-devtools -- node /absolute/path/to/dist/index.js

# 通过参数指定无头模式与视口
codex mcp add firefox-devtools -- \
  node /absolute/path/to/dist/index.js --headless --viewport 1280x720

# 或者通过环境变量
codex mcp add firefox-devtools \
  --env START_URL=https://example.com \
  --env FIREFOX_HEADLESS=true \
  -- node /absolute/path/to/dist/index.js
```

### 配置文件

Claude Code 的 `mcp_settings.json`：

```json
{
  "mcpServers": {
    "firefox-devtools": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js", "--headless", "--viewport", "1280x720"],
      "env": {
        "START_URL": "about:blank"
      }
    }
  }
}
```

Codex 的 `~/.codex/config.toml`：

```toml
[mcp_servers.firefox-devtools]
command = "node"
args = ["/absolute/path/to/dist/index.js", "--headless", "--viewport", "1280x720"]

[mcp_servers.firefox-devtools.env]
START_URL = "about:blank"
```

Windows 上请用正斜杠（`C:/tools/dist/index.js`）或转义的反斜杠。

`npm run setup` 会把同样的 JSON 写入 Claude Code 对应的文件，使用的是本地构建。

## 卸载

没有安装器、服务或全局包需要移除：服务器就是你解包或构建出来的一个目录，其余它写入的东西都在 `~/.firefox-devtools-mcp`（Windows 上是 `%USERPROFILE%\.firefox-devtools-mcp`）。三步，按顺序执行。

**1. 撤销浏览器补丁（如果打过）。** 在管理员身份启动的终端里，Firefox 需已关闭：

```bash
node dist/stealth-cli.js restore --firefox-path "C:\Program Files\Waterfox\waterfox.exe"
node dist/stealth-cli.js prune
```

`restore` 把备份复制回被改写的库文件，`prune` 删除已被新安装取代的备份。当前安装对应的那一份备份会被有意保留，因为删掉之后 `restore` 就无法使用；它由第 3 步一并删除。从未执行过 `patch` 的话这两条都跳过。如果期间浏览器升级过，`status` 会显示 `unrecognized`，此时厂商文件已经在位，无需恢复。

**2. 移除客户端条目。** 执行 `claude mcp remove firefox-devtools`，或者从[客户端注册](#客户端注册)给出的 JSON / TOML 中删除 `firefox-devtools` 块。用 `.mcpb` 安装的话，改为在 Claude Desktop 的设置里移除扩展。

**3. 删除文件。** 删除解包目录，以及数据目录 `~/.firefox-devtools-mcp`（`%USERPROFILE%\.firefox-devtools-mcp`）。数据目录里是本服务器创建的 `--auto-profile` 或 `--profile-path` 配置文件、`saveTo` 输出、Firefox 日志，以及 stealth 的备份与记录。删除它会丢失该配置文件在 agent 使用期间积累的登录状态；你自己的 Firefox 配置文件不受影响。

geckodriver 要么来自 `PATH` 或 `~/.cache/selenium`（与其他 Selenium 项目共用，通常建议保留），要么由包内下载到解包目录中，后者会被第 3 步删除。

## 上游 npm 包

上游项目把它的公共构建发布到 npm。`npx @mozilla/firefox-devtools-mcp@latest` 的用法、各客户端安装命令以及该包其余文档，见[上游 README](https://github.com/mozilla/firefox-devtools-mcp#readme)。那个构建只包含公共模块，所以它的说明不适用于本 fork 的构建，相关问题也归上游追踪器。

## 配合 MCP Inspector 试用

```bash
npx @modelcontextprotocol/inspector node dist/index.js --start-url https://example.com --headless
```

然后可以调用这些工具：

- `list_pages`、`select_page`、`navigate_page`
- `take_snapshot`，再配合 `click_by_uid` / `fill_by_uid`
- `list_network_requests`（始终在录制）、`get_network_request`
- `list_downloads`（始终在录制）、`set_download_behavior`
- `screenshot_page`、`list_console_messages`

## CLI 选项

可以用命令行参数，也可以用括号里的环境变量：

- `--firefox-path` —— Firefox 可执行文件的绝对路径
- `--headless` —— 无界面运行（`FIREFOX_HEADLESS=true`）
- `--viewport 1280x720` —— 初始窗口尺寸
- `--profile-path` —— 使用指定的 Firefox 配置文件。Firefox 实际运行在该路径下的 `firefox_devtools_mcp_profile` 子目录中，并以 `.firefox-devtools-mcp` 文件标记；把 `--profile-path` 指向一个已标记的配置文件则直接复用它
- `--auto-profile` —— 复用存放在 `~/.firefox-devtools-mcp/` 下的持久配置文件，登录状态在多次运行间保留。给出 `--firefox-path` 时按该二进制区分（`AUTO_PROFILE=true`）
- `--firefox-arg` —— 额外的 Firefox 参数（可重复）
- `--start-url` —— 启动时打开这个 URL（`START_URL`）
- `--accept-insecure-certs` —— 忽略 TLS 错误（`ACCEPT_INSECURE_CERTS=true`）
- `--connect-existing` —— 连接到已在运行的 Firefox，而不是新启动一个（`CONNECT_EXISTING=true`）。见[连接到已有 Firefox](#连接到已有-firefox)
- `--marionette-port` —— connect-existing 模式使用的 Marionette 端口，默认 2828（`MARIONETTE_PORT`）
- `--idle-timeout` —— connect-existing 会话在多少秒没有工具调用后释放 Firefox，默认 1800。Firefox 同一时间只接受一个客户端，所以其他客户端要等它释放后才能连上；下一次工具调用会重新连接，并选中当时处于活动状态的标签页（`IDLE_TIMEOUT`）
- `--pref name=value` —— 通过 `moz:firefoxOptions` 在启动时设置 Firefox 首选项（可重复）。`--connect-existing` 下不生效，因为服务器不负责启动浏览器；这类首选项请在 `about:config` 里设置
- `--tool-preset` —— 选择启用哪些工具模块：`slim`、`basic`（默认）、`developer`、`mozilla`、`all`。见[工具模块与预设](#工具模块与预设)。（`TOOL_PRESET`）
- `--tools` —— 显式列出要启用的模块，完全覆盖 `--tool-preset`（例如 `--tools pages network script`）。见[工具模块与预设](#工具模块与预设)。
- `--enable-script` —— _已废弃，请用 `--tool-preset developer` 或 `--tools ... script debugging`。_ 选择 `developer` 预设。（`ENABLE_SCRIPT=true`）
- `--enable-privileged-context` —— _已废弃，请用 `--tool-preset mozilla` 或 `--tools ... privileged prefs`。_ 选择 `mozilla` 预设。需要 `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`（`ENABLE_PRIVILEGED_CONTEXT=true`）
- `--android-device` —— 启用 Firefox for Android 模式；值为 ADB 设备序列号（例如 `emulator-5554`）。用 `adb devices` 列出已连接设备。省略值或写 `auto` 会自动选择唯一连接的设备。
- `--android-wipe-app-data` —— 确认 Android 模式会清空目标应用的全部数据。与 `--android-device` 一起使用，必需。（`ANDROID_WIPE_APP_DATA=true`）
- `--android-package` —— Android 应用包名，默认 `org.mozilla.firefox`。其他可选：Firefox Beta 用 `org.mozilla.firefox_beta`，Firefox Nightly 用 `org.mozilla.fenix`，Firefox Nightly Debug 用 `org.mozilla.fenix.debug`，geckoview 用 `org.mozilla.geckoview_example`（`ANDROID_PACKAGE`）
- `--unrestricted-save-paths` —— 让 `saveTo` 参数可以写到磁盘任意位置，而不限于默认根目录。见[把大体积输出写到磁盘](#把大体积输出写到磁盘)以及 [SECURITY.md](SECURITY.md) 中的安全提示。（`UNRESTRICTED_SAVE_PATHS=true`）
- `--log-file` —— 把 MCP 服务器日志写入文件而不是 stderr。当客户端隐藏服务器输出时便于排查。设置 `DEBUG=*` 可一并输出调试日志。示例：`--log-file /tmp/firefox-mcp.log`

### 工具模块与预设

工具按模块分组。可以用命名预设（`--tool-preset`）或显式列表（`--tools`）选择暴露哪些模块。两者同时给出时以 `--tools` 为准，预设被忽略。

预设（每个都是前一个的超集）：

- `slim` —— 浏览和操作页面的最小集合
- `basic`（默认）—— 加上日常浏览所需的工具
- `developer` —— 加上 Web 开发者所需的工具
- `mozilla` —— 加上 Firefox 开发者所需的工具
- `all` —— 全部模块

模块清单和各预设包含的模块见 [docs/tools.md](docs/tools.md#modules-and-presets)。

注意默认的 `basic` 包含 `script` 模块，也就包含 `evaluate_script` 工具。它对攻击面的影响见 [SECURITY.md](SECURITY.md#tool-modules-and-presets)；想去掉它就用 `--tool-preset slim` 或显式的 `--tools` 列表。

```bash
# 使用 developer 预设（加上网络、控制台、调试、性能分析工具）
node dist/index.js --tool-preset developer

# 只启用需要的模块
node dist/index.js --tools pages network console

# 或者把列表放在文件里：["pages", "network", "console"]
node dist/index.js --tool-preset ./my-tools.json
```

`--tool-preset` 既可以接受内置预设名，也可以接受一个 JSON 文件路径，文件内容是模块名数组或 `{ "modules": [...] }`，因此自定义集合可以放在仓库里，也可以放在 MCP 客户端配置里，而不必写在命令行上。

`prefs` 和 `privileged` 模块需要 `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`。`launch` 模块会用调用方指定的二进制、配置文件、环境变量和首选项重启 Firefox，属于应当由操作者自己掌控的配置变更。`bidi` 模块可以发送任意 WebDriver BiDi 命令，因此能触达其他模块暴露的能力。`stealth` 模块修改已安装的浏览器二进制，需要服务器通常没有的提权，所以它不在 `mozilla` 预设里，而是由一个单独的命令来执行，只有 `all` 包含它；见 [stealth 模块](#stealth-模块)。本 fork 把上面五个模块全部编译进去；上游的公共包即使被要求也会跳过它们，并在日志里列出被丢弃的模块名。

### stealth 模块

`navigator.webdriver` 由 C++ 回答——`Navigator::Webdriver()` 会向 remote agent 与 Marionette 询问当前是否处于自动化状态——所以任何首选项或页面脚本都改不了它。`stealth` 模块在产生答案的地方改：它在浏览器加载的共享库（Windows 上是 `xul.dll`，Linux 上是 `libxul.so`）中定位这个函数，把入口覆盖为 `xor eax, eax; ret`，于是自动化会话进行期间该属性读作 false。这一点已在浏览器上验证：打补丁后 `navigator.webdriver` 为 `false`，会话照常工作；恢复文件后又变回 `true`。

由于写入发生在安装目录，这一步由单独的命令完成，在一个以管理员身份启动的终端中执行——服务器本身始终保持非特权：

```bash
# 先执行 `npm run build:moz`（Release tar 包中该文件是 dist/stealth-cli.js）
node dist.moz/stealth-cli.js status
node dist.moz/stealth-cli.js patch --firefox-path "C:\Program Files\Waterfox"
node dist.moz/stealth-cli.js restore --firefox-path "C:\Program Files\Waterfox"
node dist.moz/stealth-cli.js prune --dry-run   # 确认后再去掉 --dry-run
```

`--firefox-path` 既可以给可执行文件，也可以给装着它的安装目录，写在命令前后都行。引号内不要
以反斜杠结尾，PowerShell 会把它当成转义。不给这个选项时，Windows 上只会去找自动探测到的
**Firefox** 安装：`Program Files`、`firefox.exe` 的 App Paths 注册表项，或 `PATH`。其他构建——
Waterfox、LibreWolf、便携版——只有显式传路径才能找到，上面示例正是因此写了路径。`status`、`patch`、`restore` 也有同名的 MCP 工具（`get_stealth_status`、`patch_navigator_webdriver`、`restore_navigator_webdriver`），选择 `all` 预设时会暴露。

写入之前，原文件会备份到 `~/.firefox-devtools-mcp/stealth/backups/<sha256>/`。每次浏览器升级都会留下更早的备份，因此 `prune` 会删除除"当前安装对应的那一份"之外的所有备份，并报告删掉了什么；`--dry-run` 先只列出。若没有任何备份属于给定路径，它会拒绝执行，所以路径写错也不会清空整个目录。

浏览器必须关闭：库文件正在被加载，Windows 会拒绝写入，命令会把这种情况报告为文件被占用。安装在 `Program Files` 下则需要提权终端，这种情况报告为权限错误。函数是通过字节签名定位的，而不是固定地址，因此同一条补丁可以跨多次重新构建使用；某次构建不匹配任何已知签名时，命令报告 `unrecognized` 并且什么都不改。浏览器升级会用厂商文件替换掉打过补丁的文件，所以它在新版本的签名被加入之前同样报告 `unrecognized`，旧备份会保留，但绝不会覆盖到新安装上。目前签名覆盖 Windows x64 153 构建；补丁实现了 Windows 与 Linux，不支持 macOS。

### 常用首选项

通过 `--pref` 传入：

- remote.prefs.recommended=false。Firefox 在自动化模式下会应用一套 [RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs)，改变浏览器行为以便测试。把它设为 false 可以跳过这些改动，让配置更接近普通 Firefox。**只要这个配置文件里还有你自己的数据，就应该设上**：这套推荐值是为可随时丢弃的测试配置文件准备的，用在日常浏览的配置文件上会改掉真实设置（更新、会话恢复、cache/bfcache、遥测）。在 `--connect-existing` 模式下 `--pref` 无法传递给浏览器，请先在 `about:config` 里设置，见[连接到已有 Firefox](#连接到已有-firefox)。
- remote.log.level=Trace。在 Firefox 中输出详细的 WebDriver 协议日志。MCP 服务器会自动把对应的日志级别传给 geckodriver，两边详细程度一致。
- app.update.disabledForTesting=false。允许 Firefox 自动下载并应用更新。注意更新可能打断当前会话。需要同时设置 remote.prefs.recommended=false。

### Firefox for Android

用 `--android-device` 自动化运行在 Android 设备上的 Firefox。需要 `PATH` 中有 `adb`；geckodriver 会自动管理。

> **警告：** Android 模式会在每次会话前清空目标应用的全部数据。
> 标签页、历史、书签、密码、cookie 和设置都会丢失。geckodriver 在创建会话时执行
> `adb shell pm clear <package>`，且没有跳过该步骤的选项，随后会话运行在它自己的
> 临时配置文件上，结束后删除。因此 `--android-device` 必须配合
> `--android-wipe-app-data`，并且应该安装一个专供自动化的构建，而不是自动化你日常
> 使用的浏览器。[Bug 2064088](https://bugzilla.mozilla.org/show_bug.cgi?id=2064088)
> 在跟踪给 geckodriver 增加"保留现有应用数据"选项的工作。

```bash
# 列出已连接设备
adb devices

# 在唯一连接的设备上启动 Firefox for Android
node dist/index.js --android-device auto --android-wipe-app-data

# 指定某台设备
node dist/index.js --android-device <serial> --android-wipe-app-data

# 改用 Firefox Nightly
node dist/index.js --android-device <serial> --android-package org.mozilla.fenix --android-wipe-app-data
```

主机与设备之间的端口转发由 geckodriver 自动处理。

### 连接到已有 Firefox

默认情况下服务器会自己启动一个 Firefox。`--connect-existing` 则附加到你已经开着的浏览器上，于是 agent 在你的会话里工作：你的标签页、你的登录状态、你的 cookie，不必再登录第二个配置文件。想让 agent 操作你真正在用的浏览器，走这条路。

#### 1. 先准备配置文件：`remote.prefs.recommended=false`

WebDriver 会话开始时，Firefox 会应用它面向测试的
[RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs)，
除非 `remote.prefs.recommended` 为 `false`。这些首选项会写入正在使用的配置文件，并改变更新检查、会话恢复、cache 与 bfcache、遥测等行为，因为它们是按"可随时丢弃的测试配置文件"假设的。请在把 agent 放进来之前关掉它，否则 Firefox 会把你自己的配置文件当成自动化配置文件，改动你在意的设置：

- `about:config` → `remote.prefs.recommended` → `false`（保存在该配置文件中），或
- 在配置文件的 `user.js` 中加入 `user_pref("remote.prefs.recommended", false);`。

这里的 `--pref remote.prefs.recommended=false` **不**起作用：该模式下服务器不发送任何
`moz:firefoxOptions` 首选项，因为在运行中的浏览器上改首选项可能干扰 Remote Agent。请在浏览器里按上面的方式设置。如果是由服务器自己启动 Firefox，`--pref` 才是正确做法，本节也就不适用。

#### 2. 带远程控制参数启动 Firefox

两个参数都要有，因为服务器同时使用 WebDriver Classic（`--marionette`）和 WebDriver BiDi（`--remote-debugging-port`）。只给其中一个，连接会失败，服务器会提示你带两个参数重启：

```bash
# 先完全退出 Firefox：这些参数只对带着它们启动的进程有效。
firefox --marionette --remote-debugging-port
```

如果 Firefox 已经在运行，这条命令只会在那个实例里新开一个窗口：参数被忽略，Marionette 和 Remote Agent 都不会启动。请彻底退出 Firefox，再带参数启动。

#### 3. 让服务器连上它

```bash
node dist/index.js --connect-existing --marionette-port 2828
```

2828 是默认端口。用了别的端口就传 `--marionette-port`，例如你用
`--marionette --marionette-port 4242 --remote-debugging-port` 启动的 Firefox。

Marionette 同一时间只接受一个客户端，因此：

- `close_firefox_session` 会结束会话但保留浏览器运行——任务完成后用它，然后不带参数重启 Firefox；
- `--idle-timeout`（默认 1800 秒）会在空闲一段时间后自动做同样的事，好让其他客户端接管；
- 下一次工具调用会重新连接，并选中当时处于活动状态的那个标签页。

该模式下 `--start-url` 会被忽略，所以连接不会把你正在看的页面导航走。

#### 如果你不想用日常配置文件

那就给服务器单独一个配置文件：Firefox 每个配置文件只跑一个进程，两个实例可以并存，agent 只能触达你在那个配置文件里登录的东西：

```bash
# 只需一次：创建专用配置文件
firefox -CreateProfile firefox-mcp

# 带着 Marionette 与 Remote Agent 启动它，与日常 Firefox 并存
firefox -P firefox-mcp --marionette --remote-debugging-port
```

> **警告：** 日常浏览时不要一直开着 Marionette。它会让
> `navigator.webdriver = true` 并改变其他浏览器指纹信号，可能触发 Cloudflare、Akamai
> 等防护站点的机器人检测。只在需要 MCP 自动化时开启，用完正常重启 Firefox，
> 或者像上面那样使用独立的配置文件。[stealth 模块](#stealth-模块)可以在会话期间
> 让 `navigator.webdriver` 读作 false。

## 工具

逐个模块的工具清单、说明和参数见 [docs/tools.md](docs/tools.md)（由源码生成）。

### 把大体积输出写到磁盘

大体积的工具输出会大量占用 Claude Code 这类 CLI 客户端的上下文。若干工具支持可选的 `saveTo` 参数，把结果写入文件而不内联返回。支持该参数的工具列表见 [docs/tools.md](docs/tools.md#tools-that-accept-saveto)。`saveTo` 有三种形式：

- 文件路径（相对于当前工作目录，或 `~/.firefox-devtools-mcp/output` 内的绝对路径；父目录会自动创建）。指向 Firefox 配置文件或本服务器会回读的文件的路径会被拒绝
- 一个已存在的目录（在其中生成带时间戳的文件）
- `true`（在 `~/.firefox-devtools-mcp/output/` 下生成带时间戳的文件）

响应会返回路径与字节数。写入的文件始终是完整未截断的数据：内联返回时的尺寸保护（控制台消息条数上限、网络头部截断、快照行数上限）对它都不起作用。

产生文本的工具还接受 `preview`，即把已写入输出的前 N 个字符作为简短摘录内联回显。docs/tools.md 中的列表标明了哪些工具支持它。

```
screenshot_page({ saveTo: "page.png" })
take_snapshot({ saveTo: true })
list_network_requests({ urlContains: "api", saveTo: "network.json" })
evaluate_script({ function: "() => performance.getEntries()", saveTo: true, preview: 2000 })
```

默认情况下保存路径是受限的：相对路径相对于当前工作目录解析，绝对路径只允许落在 `~/.firefox-devtools-mcp` 内。越界的路径会被拒绝。需要写到任意位置（包括该目录之外的绝对路径）时，用 `--unrestricted-save-paths` 启动服务器。

保存下来的文件随后可以用 Claude Code 的 `Read` 工具查看，而不影响上下文大小。

## 从源码构建

本仓库的构建使用全工具集入口（`src/index.moz.ts`），所有工具模块都会被编译进去，包括 `prefs`、`privileged`、`launch` 和 `bidi`。

```bash
npm install
npm run build:moz

# 用 Inspector 对着本地构建运行
npx @modelcontextprotocol/inspector node dist.moz/index.js --headless --viewport 1280x720

# 或者在开发模式下热重载
npm run inspector:dev
```

`npm run build:moz` 输出到 `dist.moz/`。Release 归档与 `.mcpb` 包把这个目录发布为 `dist/`。

本地开发、测试与 CI 的更多细节见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 故障排查

- 找不到 Firefox：传 `--firefox-path "/Applications/Firefox.app/Contents/MacOS/firefox"`（macOS），或你系统上的正确路径。
- 第一次运行较慢：Selenium 要建立 BiDi 会话；之后会快一些。
- UID 失效：UID 在其元素被移除或页面跳转前一直有效；某个 UID 工具报告元素已不存在时，重新 `take_snapshot`。
- Windows 10 上出现 `Error during discovery for MCP server 'firefox-devtools': MCP error -32000: Connection closed`：
  - **方案 1** 用 `cmd /c` 包一层（[详情](https://github.com/modelcontextprotocol/servers/issues/1082#issuecomment-2791786310)）：

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "cmd",
        "args": ["/c", "node", "C:\\tools\\dist\\index.js"]
      }
    }
    ```

  - **方案 2** 不依赖 `PATH`，直接用 `node` 的绝对路径：

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "C:\\nvm4w\\nodejs\\node.exe",
        "args": ["C:\\tools\\dist\\index.js"]
      }
    }
    ```

## 版本管理

- 1.0 之前的 API：版本从 `0.x` 起。每个发布都是本仓库上的一个 `vX.Y.Z` tag；最新的从 [Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases) 取。

## 参与贡献

提交 issue、运行测试以及在本地开发的说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 作者

上游项目由 [Mozilla](https://www.mozilla.org) 维护。本 fork 由 [LTHPKBTE](https://github.com/LTHPKBTE) 维护。

## 许可

可选 [MIT](LICENSE-MIT) 或 [Apache 2.0](LICENSE-APACHE) 之一授权。
