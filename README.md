# Next 个人执行系统

一个面向个人目标、项目、任务和每日执行的本地优先应用。项目当前已经从早期的 Next.js 后端 + Prisma 模式调整为静态前端 + 浏览器/WebView 本地数据层，适合直接在浏览器中运行，也可以通过 Capacitor 打包为 Android APK。

## 功能概览

- 今日执行：根据可用时间、精力、心情和推进模式生成今日推荐任务。
- 任务管理：维护目标、项目、任务，支持状态流转、优先级、截止时间、阻塞、估时和搜索筛选。
- Inbox 收集箱：快速记录零散想法，并转换为任务、项目或目标。
- 执行记录：开始、停止和完成任务执行，记录本次执行时长。
- 每日复盘：按日期生成复盘草稿，汇总计划完成情况、执行时长和专注评分。
- AI 辅助：可配置 OpenAI 或兼容接口，用于推荐理由润色、Inbox 拆解、项目任务建议和复盘草稿；未配置 API Key 时使用本地兜底逻辑。
- 数据备份：支持导出 JSON 备份，并按跳过或覆盖策略导入。
- Android 支持：已接入 Capacitor Android 工程，可构建本地运行的 APK。

## 技术栈

- React 19
- Vite 7
- TypeScript
- Tailwind CSS
- React Router
- Capacitor Android
- Prisma schema 保留为数据模型参考和迁移基础

## 项目结构

```text
.
├── android/                 # Capacitor Android 工程
├── backups/                 # 本地备份样例或导出文件，当前已被 .gitignore 忽略
├── prisma/                  # Prisma schema 和本地 SQLite 开发数据库
├── scripts/                 # 辅助脚本
├── src/
│   ├── components/          # 页面组件、表单和基础 UI
│   ├── lib/                 # 推荐算法、AI、备份、日期和数据层逻辑
│   ├── pages/               # Today、Tasks、Inbox、Review、Settings 页面
│   ├── styles/              # 全局样式
│   └── App.tsx              # 路由入口
├── tests/                   # 单元测试和集成测试
├── 使用说明.md              # 当前打包/迁移说明
└── README.md
```

## 本地运行

安装依赖：

```powershell
npm install
```

启动开发服务器：

```powershell
npm run dev
```

构建静态产物：

```powershell
npm run build
```

预览构建结果：

```powershell
npm run start
```

## 环境变量

项目提供 `.env.example` 作为模板。需要本地配置时复制一份：

```powershell
Copy-Item .env.example .env
```

常用配置：

```env
AI_PROVIDER="openai"
AI_BASE_URL="https://api.openai.com/v1"
AI_API_KEY=""
AI_MODEL="gpt-5"
AI_API_STYLE="responses"
```

说明：

- `.env` 已被 `.gitignore` 忽略，不应提交真实密钥。
- Web 端 AI 配置也可以在应用的「设置」页面填写，并保存在本地浏览器存储中。
- 未配置 `AI_API_KEY` 或 `OPENAI_API_KEY` 时，应用会使用本地兜底建议。

## 数据存储

当前数据层位于 `src/lib/client/local-data.ts`，以浏览器/WebView 本地持久化为主：

- 优先使用 IndexedDB 保存本地数据库快照。
- 同时保留 localStorage 读写兼容。
- 支持导出和导入 JSON 备份。
- 不需要部署后端即可运行。

`prisma/schema.prisma` 仍保留数据模型定义，便于后续切换到 SQLite、Capacitor SQLite 或服务端数据库。

## 常用脚本

```powershell
npm run dev              # 启动 Vite 开发服务器
npm run build            # 构建静态前端
npm run start            # 预览构建结果
npm run lint             # TypeScript 类型检查
npm test                 # 运行全部测试
npm run test:unit        # 运行单元测试
npm run test:integration # 运行集成测试
npm run android:sync     # 同步 Web 产物到 Android 工程
npm run apk:debug        # 构建 debug APK
```

## Android 打包

项目已经加入 Capacitor Android 工程。重新打包一般执行：

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

如果本机需要指定 JDK：

```powershell
$env:JAVA_HOME="D:\develop\JDK\jdk21"
```

APK 输出路径：

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

更详细的当前打包记录见 `使用说明.md`。

## Git 提交注意事项

以下内容已经配置为忽略，不应上传到 GitHub：

- `.env`
- `node_modules/`
- `dist/`
- `.npm-cache/`
- `.tmp/`
- `*.db`
- `*.sqlite`
- `*.log`
- `*.pid`
- `backups/`
- Android 构建产物和本地配置

上传前建议检查：

```powershell
git status --short --ignored
```

确认没有真实 API Key、数据库文件、构建产物或个人备份被加入提交。
