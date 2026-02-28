# koishi-plugin-custom-image-api

## 项目介绍 (Project Introduction)

### 中文
这是一个为 Koishi 机器人框架开发的**趣味图片生成插件**，内置黑丝举牌、动漫举牌等实用图片功能，支持灵活的配置项和缓存管理机制。核心特性：
- 🖼️ 内置 `hsjp`、`dmjp` 等趣味图片生成接口
- 💡 可配置等待提示、成功提示、超时提示
- ⚙️ 简单易用的指令与配置项，开箱即用
- 🧹 支持自动清理缓存与手动清理指令
- ⏱️ 可自定义请求超时、发送超时时间

### English
A fun image generation plugin for the Koishi bot framework, with built-in practical image functions such as haisi and dongman, supporting flexible configuration items and cache management mechanisms. Core features:
- 🖼️ Built-in fun image generation APIs: `hsjp`, `dmjp`
- 💡 Configurable waiting, success, and timeout tips
- ⚙️ Simple commands and configurations, ready to use
- 🧹 Auto cache cleanup & manual clear command
- ⏱️ Customizable request timeout and send timeout time

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

| 配置项 (Config Item) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|----------------------|-------------|------------------|--------------------|
| `enable` | boolean | true | 是否启用插件 |
| `showWaitingTip` | boolean | true | 请求图片时是否显示等待提示 |
| `timeout` | number | 10000 | API 请求超时时间（毫秒） |
| `hsjpEnabled` | boolean | true | 是否启用黑丝举牌功能 |
| `dmjpEnabled` | boolean | true | 是否启用动漫举牌功能 |
| `imageSendTimeout` | number | 15000 | 图片发送超时（毫秒） |
| `autoClearCacheInterval` | number | 60 | 自动清理缓存间隔（分钟） |
| `tempDir` | string | ./temp_images | 临时图片保存目录 |
| `showSuccessTip` | boolean | true | 请求图片成功时是否显示提示 |
| `showTimeoutTip` | boolean | true | API 请求超时后是否给用户提示 |

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