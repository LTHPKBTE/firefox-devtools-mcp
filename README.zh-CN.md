# Firefox DevTools MCP

English | [简体中文](README.zh-CN.md)

> **不是 Mozilla 的仓库。** 本 fork
> （[LTHPKBTE/firefox-devtools-mcp](https://github.com/LTHPKBTE/firefox-devtools-mcp)）构建的是
> [mozilla/firefox-devtools-mcp](https://github.com/mozilla/firefox-devtools-mcp) 的全工具集变体；
> 上游代码、上游发布和 `@mozilla/firefox-devtools-mcp` 包都由上游项目维护。

本仓库构建的问题——Release tar 包、`.mcpb` 扩展、CI 产物、本地 `npm run build:moz`——提到
[本仓库的 issues](https://github.com/LTHPKBTE/firefox-devtools-mcp/issues)，并说明构建来源。
上游追踪器只接受用上游包复现过的问题；这里改动的代码在上游无法复现。

[![CI](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml)

MIT 或 Apache 2.0，任选其一——见[许可](#许可)。

MCP 服务器，让 AI agent 驱动 Firefox：浏览（读页面、填表单、走多步流程）与 Web 开发
（控制台、网络请求、调试器、性能分析器）。它通过 Selenium WebDriver 使用 WebDriver BiDi
控制 Firefox，可与 Claude Code、Claude Desktop、Cursor、Cline 等 MCP 客户端配合。

- 本仓库：https://github.com/LTHPKBTE/firefox-devtools-mcp
- 上游：https://github.com/mozilla/firefox-devtools-mcp

Firefox 必须装在本地，glama.ai 这类托管服务跑不了这个服务器。从[安装](#安装)读起。不含
Mozilla 专用模块的上游公共构建见[上游 README](https://github.com/mozilla/firefox-devtools-mcp#readme)。

## 安全

浏览器能访问什么，agent 就能访问什么：cookie、已保存的登录、进行中的会话。

- 给它一个不装敏感数据的配置文件。`--connect-existing` 是唯一以你自己会话为目标的模式，
  它给 agent 同样的访问范围，代价写在[连接到已有 Firefox](#连接到已有-firefox)。
- 只访问你自己控制或信任的站点。页面内容可以夹带针对 agent 的指令（提示注入）。
- 只开启需要的模块。`basic` 包含 `evaluate_script`，`--tool-preset slim` 会去掉它；
  `developer`（控制台、网络、调试器、性能分析器）和 `mozilla`（特权上下文、首选项）
  会进一步扩大范围。

各模块的风险与漏洞上报方式见 [SECURITY.md](SECURITY.md)。

## 环境要求

- Node.js ≥ 20.19.0
- Firefox 100+，`script` 模块（`evaluate_script`、logpoint）需 153+
- Windows 上自动探测；其他安装用 `--firefox-path` 指定

## 安装

从源码构建。服务器会驱动你的浏览器，`stealth` 还会改写 Firefox 安装目录里的文件，
运行前先读一遍 `src/`：

```bash
git clone https://github.com/LTHPKBTE/firefox-devtools-mcp
cd firefox-devtools-mcp
npm install
npm run build:moz
node dist.moz/index.js --auto-profile
```

测试与其他脚本见[从源码构建](#从源码构建)。

### 预构建版本

不发布到 npm 或 MCP registry，那些名字属于上游。产物全部由 GitHub Actions 构建：

- **[Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases)**，由 `vX.Y.Z` tag 创建：
  - `firefox-devtools-mcp-vX.Y.Z.tar.gz`——全工具集，适用于任何 MCP 客户端
  - `firefox-devtools-mcp-X.Y.Z.mcpb`——Claude Desktop 扩展，双击安装
- **最新的 `main`**——Actions → [CI](https://github.com/LTHPKBTE/firefox-devtools-mcp/actions/workflows/ci.yml)
  → 最近一次运行 → *Artifacts* → `dist.moz/`。需要 GitHub 账号，7 天后删除。

从 tar 包安装（含 `dist/` 与 `package.json`）：

```bash
mkdir firefox-devtools-mcp
tar -xzf firefox-devtools-mcp-v0.10.7.tar.gz -C firefox-devtools-mcp
cd firefox-devtools-mcp
npm install --omit=dev
node dist/index.js --auto-profile             # MCP 服务器（stdio）
node dist/stealth-cli.js status               # 可选：二进制补丁命令
```

用那个绝对路径注册：

```bash
claude mcp add firefox-devtools node /absolute/path/to/firefox-devtools-mcp/dist/index.js -- --auto-profile
```

`dist/` 里还有 `snapshot.injected.global.js`，快照工具注入的浏览器端脚本。另外，只有
`--tool-preset all` 才会暴露 `stealth` 工具。

本文后续命令按这个布局写成 `dist/index.js`；用 `npm run build:moz` 自行构建时输出是
`dist.moz/index.js`。

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

没有安装器、服务或全局包：服务器就是你解包或构建出来的目录，其余写入都在
`~/.firefox-devtools-mcp`（Windows 上是 `%USERPROFILE%\.firefox-devtools-mcp`）。

**1. 撤销浏览器补丁（如果打过）。** 在管理员终端里，Firefox 已关闭：

```bash
node dist/stealth-cli.js restore --firefox-path "C:\Program Files\Waterfox"
node dist/stealth-cli.js prune
```

`restore` 把备份复制回被改写的库文件，`prune` 删除已被新安装取代的备份。当前安装对应的那份
备份会保留，因为 `restore` 需要它，由第 3 步一并删除。从未跑过 `patch` 就跳过这两条。浏览器
升级过之后 `status` 报 `unrecognized`，厂商文件已经在位，无需恢复。

**2. 移除客户端条目。** `claude mcp remove firefox-devtools`，或从
[客户端注册](#客户端注册)给出 JSON / TOML 中删除 `firefox-devtools` 块。用 `.mcpb` 安装的
话，在 Claude Desktop 设置里移除扩展。

**3. 删除文件。** 删除解包目录和 `~/.firefox-devtools-mcp`。后者装着 `--auto-profile` 或
`--profile-path` 的配置文件、`saveTo` 输出、Firefox 日志，以及 stealth 的备份与记录；删掉它
会丢失该配置文件积累的登录状态，你自己的 Firefox 配置文件不受影响。

geckodriver 来自 `PATH` 或 `~/.cache/selenium`（与其他 Selenium 项目共用，通常建议保留），
要么就在解包目录里，后者由第 3 步删除。

## 上游 npm 包

`npx @mozilla/firefox-devtools-mcp@latest` 和各客户端的安装命令见
[上游 README](https://github.com/mozilla/firefox-devtools-mcp#readme)。那个包是公共构建，
所以它的说明不适用于这里，相关问题也归上游。

## 配合 MCP Inspector 试用

```bash
npx @modelcontextprotocol/inspector node dist/index.js --start-url https://example.com --headless
```

例如：`list_pages`、`select_page`、`navigate_page`；`take_snapshot` 后再用 `click_by_uid`
或 `fill_by_uid`；`list_network_requests`、`screenshot_page`、`list_console_messages`。

## CLI 选项

参数，括号里是对应的环境变量：

- `--firefox-path` —— 浏览器可执行文件，或装着它的安装目录
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
- `--log-file` —— 把 MCP 服务器日志写入文件而不是 stderr，适合隐藏服务器输出的客户端。
  `DEBUG=*` 一并输出调试日志。示例：`--log-file /tmp/firefox-mcp.log`

### 工具模块与预设

工具按模块分组。可以用命名预设（`--tool-preset`）或显式列表（`--tools`）选择暴露哪些模块。两者同时给出时以 `--tools` 为准，预设被忽略。

预设（每个都是前一个的超集）：

- `slim` —— 浏览和操作页面的最小集合
- `basic`（默认）—— 加上日常浏览所需的工具
- `developer` —— 加上 Web 开发者所需的工具
- `mozilla` —— 加上 Firefox 开发者所需的工具
- `all` —— 全部模块

模块清单和各预设包含的模块见 [docs/tools.md](docs/tools.md#modules-and-presets)。

默认的 `basic` 包含 `script`，也就包含 `evaluate_script`；它给攻击面带来的变化见
[SECURITY.md](SECURITY.md#tool-modules-and-presets)。要去掉它就用 `--tool-preset slim` 或
显式的 `--tools` 列表。

```bash
# developer 预设：加上网络、控制台、调试、性能分析工具
node dist/index.js --tool-preset developer

# 只要需要的模块
node dist/index.js --tools pages network console

# 或者把列表放在文件里：["pages", "network", "console"]
node dist/index.js --tool-preset ./my-tools.json
```

`--tool-preset` 接受内置预设名，或一个存着模块名数组或 `{ "modules": [...] }` 的 JSON 文件路径。

五个模块需要额外条件：

- `prefs`、`privileged` —— 需要 `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`。
- `launch` —— `restart_firefox` 用调用方指定的二进制、配置文件、环境变量和首选项重启浏览器，
  浏览器配置因此变成 agent 能触达的能力。这类配置请改在命令行上给（`--pref`、
  `--firefox-path`、`--profile-path`）。
- `bidi` —— 可发送任意 WebDriver BiDi 命令，能触达其他模块暴露的能力。
- `stealth` —— 要改写已安装的浏览器二进制，需要服务器没有的提权。不在 `mozilla` 预设里，
  由单独的命令执行，包含在 `all` 里。见 [stealth 模块](#stealth-模块)。

本 fork 编译进全部五个；上游公共包即使被要求也会丢弃它们，并在日志里列出模块名。

### stealth 模块

`navigator.webdriver` 由 C++ 回答：`Navigator::Webdriver()` 向 remote agent 与 Marionette
询问当前是否处于自动化，所以首选项和页面脚本都改不了它。`stealth` 模块直接覆写共享库
（Windows 上是 `xul.dll`，Linux 上是 `libxul.so`）中这个函数的入口为 `xor eax, eax; ret`，
会话进行期间该属性读作 false。在真实构建上实测：`true` → 打补丁 → `false` → 恢复 → `true`，
会话全程可用。

写入发生在安装目录，所以由单独的命令在管理员终端里执行，服务器本身始终非特权：

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
Waterfox、LibreWolf、便携版——只有显式传路径才能找到，上面示例正是因此写了路径。

`status`、`patch`、`restore` 也有同名的 MCP 工具（`get_stealth_status`、
`patch_navigator_webdriver`、`restore_navigator_webdriver`），只在 `all` 预设下暴露。

写入之前，原文件会备份到 `~/.firefox-devtools-mcp/stealth/backups/<sha256>/`。每次浏览器升级都会留下更早的备份，因此 `prune` 会删除除"当前安装对应的那一份"之外的所有备份，并报告删掉了什么；`--dry-run` 先只列出。若没有任何备份属于给定路径，它会拒绝执行，所以路径写错也不会清空整个目录。

浏览器必须关闭：库文件正在被加载，Windows 会拒绝写入，命令会把这种情况报告为文件被占用。安装在 `Program Files` 下则需要提权终端，这种情况报告为权限错误。函数是通过字节签名定位的，而不是固定地址，因此同一条补丁可以跨多次重新构建使用；某次构建不匹配任何已知签名时，命令报告 `unrecognized` 并且什么都不改。浏览器升级会用厂商文件替换掉打过补丁的文件，所以它在新版本的签名被加入之前同样报告 `unrecognized`，旧备份会保留，但绝不会覆盖到新安装上。目前签名覆盖 Windows x64 153 构建；补丁实现了 Windows 与 Linux，不支持 macOS。

### 常用首选项

通过 `--pref` 传入：

- `remote.prefs.recommended=false` —— Firefox 会给每个自动化会话应用
  [RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs)：
  更新检查、会话恢复、cache 与 bfcache、遥测。可随时丢弃的测试配置文件无所谓；日常在用的
  配置文件则要设成 false。`--connect-existing` 模式下 `--pref` 传不到浏览器，见
  [连接到已有 Firefox](#连接到已有-firefox)。
- `remote.log.level=Trace` —— 在 Firefox 中输出详细的 WebDriver 日志。服务器会把对应级别
  传给 geckodriver，两边一致。
- `app.update.disabledForTesting=false` —— 允许 Firefox 下载并应用更新。更新可能打断会话。
  需要同时设置 `remote.prefs.recommended=false`。

### Firefox for Android

`--android-device` 自动化运行在 Android 设备上的 Firefox。需要 `PATH` 中有 `adb`；
geckodriver 自动管理。

> **警告：** Android 模式会在每次会话前清空目标应用的全部数据。
> 标签页、历史、书签、密码、cookie 和设置都会丢失。geckodriver 在创建会话时执行
> `adb shell pm clear <package>`，无法跳过，随后使用自己的临时配置文件，结束后删除。
> 因此 `--android-device` 必须配合
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

`--connect-existing` 附加到已经运行的 Firefox 上，agent 在那个会话里工作：它的标签页、它的
登录状态、它的 cookie。不加这个参数时，服务器自己启动一个浏览器。

配置文件有两种选择，都支持：

- **专用配置文件。** Firefox 每个配置文件只跑一个进程，所以专用配置文件与日常 Firefox
  并存，agent 只能触达你在那里登录的东西：

  ```bash
  firefox -CreateProfile firefox-mcp    # 一次即可
  firefox -P firefox-mcp --marionette --remote-debugging-port
  ```

- **日常配置文件。** agent 因此能触达你的 cookie、已保存的登录和进行中的会话。这正是这个
  模式的用途，也是它默认不开启的原因。

#### 1. 在该配置文件里关掉 `remote.prefs.recommended`

WebDriver 会话会让 Firefox 应用面向测试的
[RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs)，
除非 `remote.prefs.recommended` 为 `false`。它们会写进正在使用的配置文件，改变更新检查、
会话恢复、cache 与 bfcache、遥测。在 agent 连上之前设好：

- `about:config` → `remote.prefs.recommended` → `false`（保存在该配置文件中），或
- 在配置文件的 `user.js` 中写 `user_pref("remote.prefs.recommended", false);`。

`--pref remote.prefs.recommended=false` 在这里不起作用：该模式不发送任何
`moz:firefoxOptions` 首选项，因为在运行中的浏览器上改首选项可能干扰 Remote Agent。由服务器
自己启动 Firefox 时，`--pref` 才是正确做法。

#### 2. 带两个远程控制参数启动 Firefox

两个都要：WebDriver Classic（`--marionette`）和 WebDriver BiDi（`--remote-debugging-port`）。
只给一个，连接会失败，服务器会提示两个都要。

```bash
# 先完全退出 Firefox：参数只对带着它们启动的进程有效。
firefox --marionette --remote-debugging-port
```

已经在运行的实例会忽略参数，只新开一个窗口，Marionette 和 Remote Agent 都不会启动。

#### 3. 让服务器连上它

```bash
node dist/index.js --connect-existing --marionette-port 2828
```

2828 是默认端口。用了别的端口就传 `--marionette-port`，例如用
`--marionette --marionette-port 4242 --remote-debugging-port` 启动时。

Marionette 同一时间只接受一个客户端：

- `close_firefox_session` 结束会话但保留浏览器，之后不带参数重启 Firefox；
- `--idle-timeout`（默认 1800 秒）在空闲一段时间后做同样的事，好让其他客户端接管；
- 下一次工具调用会重新连接，并选中当时活动的标签页。

该模式下 `--start-url` 会被忽略，连接不会把浏览器导航走。

> **警告：** 日常浏览时不要一直开着 Marionette。它会把 `navigator.webdriver` 设成 `true`
> 并改变其他指纹信号，在 Cloudflare、Akamai 这类防护的站点上会触发机器人检测。只在会话
> 期间开启，之后不带参数重启。[stealth 模块](#stealth-模块)能让 `navigator.webdriver`
> 在会话期间读作 false。

## 工具

逐个模块的工具清单与参数见 [docs/tools.md](docs/tools.md)（由源码生成）。

## 把大体积输出写到磁盘

大体积的工具输出会占满 Claude Code 这类 CLI 客户端的上下文。带 `saveTo` 参数的工具把结果写入
文件而不内联返回，支持的工具见 [docs/tools.md](docs/tools.md#tools-that-accept-saveto)。
`saveTo` 有三种形式：

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

默认情况下保存路径受限：相对路径相对于当前工作目录解析，绝对路径必须落在
`~/.firefox-devtools-mcp` 内，越界会被拒绝。`--unrestricted-save-paths` 去掉这两条限制。

## 从源码构建

本仓库构建的是全工具集入口（`src/index.moz.ts`），所有模块都编译进去，包括 `prefs`、
`privileged`、`launch` 和 `bidi`。

```bash
npm install
npm run build:moz

# 用 Inspector 对着本地构建运行
npx @modelcontextprotocol/inspector node dist.moz/index.js --headless --viewport 1280x720

# 开发模式热重载
npm run inspector:dev
```

`npm run build:moz` 输出到 `dist.moz/`；Release 归档与 `.mcpb` 包把这个目录发布为 `dist/`。

测试、lint 与 CI 见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 故障排查

- 找不到 Firefox：用 `--firefox-path` 给出可执行文件或其安装目录。
- 第一次运行较慢：Selenium 要建立 BiDi 会话；之后会快一些。
- UID 失效：UID 在其元素被移除或页面跳转前一直有效；工具报告元素不存在时重新
  `take_snapshot`。
- Windows 10 上出现 `Error during discovery for MCP server 'firefox-devtools': MCP error -32000: Connection closed`：
  - 用 `cmd /c` 包一层（[详情](https://github.com/modelcontextprotocol/servers/issues/1082#issuecomment-2791786310)）：

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "cmd",
        "args": ["/c", "node", "C:\\tools\\dist\\index.js"]
      }
    }
    ```

  - 不依赖 `PATH`，直接用 `node` 的绝对路径：

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "C:\\nvm4w\\nodejs\\node.exe",
        "args": ["C:\\tools\\dist\\index.js"]
      }
    }
    ```

## 版本管理

1.0 之前的 API：版本从 `0.x` 起。每个发布是本仓库上的一个 `vX.Y.Z` tag，最新的在
[Releases](https://github.com/LTHPKBTE/firefox-devtools-mcp/releases)。

## 参与贡献

提交 issue、运行测试与本地开发：[CONTRIBUTING.md](CONTRIBUTING.md)。

## 作者

上游项目由 [Mozilla](https://www.mozilla.org) 维护。本 fork 由 [LTHPKBTE](https://github.com/LTHPKBTE) 维护。

## 许可

可选 [MIT](LICENSE-MIT) 或 [Apache 2.0](LICENSE-APACHE) 之一授权。
