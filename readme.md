# koishi-plugin-custom-image-api

## 项目介绍 (Project Introduction)

### 中文
这是一个为 Koishi 机器人框架开发的**趣味图片生成插件**，内置黑丝举牌 (`hsjp`)、动漫举牌 (`dmjp`) 等实用图片功能，并支持多种图片发送方式（直接发送、仅链接、文件下载）、智能缓存、去重、多引擎下载、自定义界面文本与发送重试等高级特性。核心亮点：

### English
A fun image generation plugin for the Koishi bot framework, with built-in image APIs like `hsjp` and `dmjp`. It supports multiple sending modes (direct image, link only, file download), smart caching, deduplication, multi-engine downloads, customizable UI text, and send retries. Key features:

## 项目仓库 (Repository)
- GitHub: https://github.com/Minecraft-1314/koishi-plugin-custom-image
- Issues: https://github.com/Minecraft-1314/koishi-plugin-custom-image/issues

## 核心指令 (Core Commands)

| 指令 (Command) | 说明 (Description) | 示例 (Example) |
|----------------|--------------------|----------------|
| `hsjp <msg> [msg1] [msg2]` | 生成黑丝举牌图片 | `hsjp 我喜欢你` |
| `dmjp <text>` | 生成动漫举牌图片 | `dmjp Koishi 真棒` |
| `clear-image-cache` | 清空图片缓存 | `clear-image-cache` |

## 配置项说明 (Configuration)

配置已按功能分组显示，更直观：

### 基本设置
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enable` | boolean | true | 是否启用插件 |
| `showWaitingTip` | boolean | true | 解析时显示等待提示 |
| `timeout` | number | 10000 | API 请求超时时间（毫秒） |
| `hsjpEnabled` | boolean | true | 启用黑丝举牌功能 |
| `dmjpEnabled` | boolean | true | 启用动漫举牌功能 |

### 发送设置
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `imageSendMode` | string | `'image'` | 图片发送方式：`image` 直接发送 / `link` 仅链接 / `file` 下载后发送 |
| `showSuccessTip` | boolean | true | 请求成功时显示提示 |
| `showTimeoutTip` | boolean | true | API 超时后给用户提示 |
| `imageSendTimeout` | number | 15000 | 图片发送超时（毫秒） |

### 发送与重试
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `ignoreSendError` | boolean | true | 忽略发送失败（不抛出异常） |
| `retryTimes` | number | 3 | 发送失败重试次数 |
| `retryInterval` | number | 1000 | 重试间隔（毫秒） |

### 下载引擎与性能
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `downloadEngine` | string | `'internal'` | 下载引擎：`internal` / `aria2` / `downloads` |
| `downloadConcurrency` | number | 3 | 下载线程数（仅 file 模式） |
| `downloadTimeout` | number | 120000 | 统一下载超时（毫秒） |
| `maxMediaSize` | number | 0 | 最大下载文件大小（MB），0 为不限制 |
| `aria2Host` | string | `'127.0.0.1'` | aria2 RPC 地址 |
| `aria2Port` | number | 6800 | aria2 RPC 端口 |
| `aria2Secret` | string | `''` | aria2 RPC 密钥 |
| `resumeDownload` | boolean | true | 启用断点续传（仅 aria2 模式） |

### 缓存与临时文件
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `dedupInterval` | number | 0 | 去重间隔（秒），0 表示不去重 |
| `cacheDuration` | number | 0 | 结果缓存时间（秒），0 表示不缓存 |
| `autoClearCacheInterval` | number | 60 | 自动清理缓存间隔（分钟） |
| `tempDir` | string | `./temp_images` | 临时文件目录 |

### 界面文本
所有提示信息均可自定义，留空则使用内置默认文本。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `waitingTipText` | string | `''` | 等待提示 |
| `successTipText` | string | `''` | 成功提示 |
| `timeoutTipText` | string | `''` | 超时提示 |
| `networkErrorText` | string | `''` | 网络错误提示 |
| `fetchFailedText` | string | `''` | 获取失败提示 |
| `inputErrorText` | string | `''` | 输入为空提示 |
| `inputTooLongText` | string | `''` | 输入过长提示 |
| `cacheClearedText` | string | `''` | 缓存清理提示 |
| `repeatRequestText` | string | `''` | 重复请求提示 |

## 项目贡献者 (Contributors)

| 贡献者 (Contributor) | 贡献内容 (Contribution) |
|----------------------|-------------------------|
| Minecraft-1314 | 插件完整开发 (Complete plugin development) |
| 素颜API | 提供 API 接口支持 |
| （欢迎提交 PR 加入贡献者列表） | （Welcome to submit PR to join the contributor list） |

## 许可协议 (License)

本项目采用 MIT 许可证，详情参见 [LICENSE](LICENSE) 文件。

This project is licensed under the MIT License, see the [LICENSE](LICENSE) file for details.

## 支持我们 (Support Us)

如果这个项目对您有帮助，欢迎点亮右上角的 Star ⭐ 支持我们，这将是对所有贡献者最大的鼓励！

If this project is helpful to you, please feel free to star it in the upper right corner ⭐ to support us, which will be the greatest encouragement to all contributors!