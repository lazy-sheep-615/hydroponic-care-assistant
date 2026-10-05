# 水培养护助手

一个运行在本机的水培植物养护记录工具。上传照片后，可调用你配置的兼容 OpenAI Chat Completions 的多模态模型生成观察结论；换水提醒与今日建议由本地规则计算。

## 快速开始

需要 Node.js 18 或更新版本，无需安装 npm 依赖。

```powershell
git clone https://github.com/lazy-sheep-615/hydroponic-care-assistant.git
cd hydroponic-care-assistant
node server.js
```

浏览器打开 `http://127.0.0.1:8787`。Windows 用户也可以双击 `启动养护助手.cmd`。第一次使用时，在页面右上角「设置」中填写自己的 API Key、接口地址和支持图片输入的模型名。未配置模型时，手动记录、植株管理和本地提醒仍可使用。

## 数据与隐私

- 默认仅监听 `127.0.0.1`；只有在设置中开启局域网访问后才会允许其他设备访问。
- 植株档案、日志、照片和 API Key 保存在本机 `data/`。该目录已被 Git 忽略，不会随项目提交。
- 使用 AI 分析时，所选照片及相关养护信息会发送到你填写的模型接口。请先确认该服务的隐私条款。
- 仓库内 `public/img/` 的图片只是界面示例素材，可以按 `说明.md` 替换。

## 验证与开发

```powershell
node tools/e2e.js
```

自检使用临时数据目录与假模型接口，不会修改真实 `data/`。项目是原生 HTML、CSS、JavaScript 和 Node.js 内置模块实现，没有构建步骤。接手开发请先读 [AGENTS.md](AGENTS.md)，使用细节见 [说明.md](说明.md)。

## 许可证

当前仓库尚未指定开源许可证。公开分享代码不等于授予他人复制、修改或再发布的权限。
