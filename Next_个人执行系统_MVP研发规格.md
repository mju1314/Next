# Next 个人执行系统 MVP 研发规格

版本: V0.2  
目标: 将产品设计文档补充为可以直接进入开发的研发规格  
适用范围: 单人本地优先版本, 暂不考虑公开上线、团队协作、支付和复杂多端同步

## 1. 产品目标

Next 是一个面向个人的执行决策系统, 首版只解决一个核心问题:

> 今天下一步最值得做什么?

首版不追求完整项目管理, 也不追求复杂日历排期。MVP 的目标是形成一个最小闭环:

1. 快速收集想法。
2. 把想法整理为目标、项目和任务。
3. 每天生成 1 个主任务和 3 个备选任务。
4. 执行后记录耗时与完成状态。
5. 用真实执行数据反哺下一次推荐。

## 2. 首版技术方案

### 2.1 默认技术选型

为了最快交付一个个人可用版本, 首版采用:

| 层级 | 方案 |
| --- | --- |
| 客户端 | Next.js + React + TypeScript |
| UI | Tailwind CSS 或现有组件库 |
| 数据库 | SQLite |
| ORM | Prisma |
| AI 接入 | 本地规则评分为主, 大模型只做拆解、解释、复盘总结 |
| 部署形态 | 本地运行优先; 前端按移动端优先重构, 目标封装为安卓 APK (Capacitor), 数据层后续迁移至设备本地存储 (IndexedDB) |
| 前端样式 | Tailwind CSS, 通过主题 token 统一设计变量 |

### 2.2 关键技术原则

1. 所有核心决策数据必须先落库, 不只存在前端状态里。
2. 评分公式在本地执行, 结果可解释、可回溯。
3. 大模型输出不能直接覆盖任务数据, 必须经过用户确认或本地规则校验。
4. 首版不做登录、团队权限、支付和云同步。
5. 数据库字段保留未来迁移空间, 但不要为未来功能牺牲首版交付速度。

## 3. MVP 功能范围

### 3.1 必做

| 模块 | MVP 能力 |
| --- | --- |
| Inbox 收集箱 | 快速记录想法, 标记为待处理/已转换/忽略 |
| Goal 目标 | 创建、编辑、暂停、完成长期目标 |
| Project 项目 | 创建项目, 绑定目标, 查看项目任务 |
| Task 任务 | 创建任务, 设置估时、截止时间、类型、精力要求、手动优先级 |
| Today 首页 | 展示今日主任务、备选任务、推荐理由、开始/完成/跳过操作 |
| DailyPlan | 记录当天可用时间、精力、心情和计划状态 |
| DailyFocus | 保存每日推荐的主任务和备选任务 |
| WorkSession | 记录任务开始、结束、实际耗时和专注度 |
| 规则推荐 | 根据任务、目标、时间、状态生成今日推荐 |
| 数据导出 | 导出 JSON 备份 |

### 3.2 暂缓

| 模块 | 暂缓原因 |
| --- | --- |
| 团队协作 | 与个人执行闭环无关 |
| 多端实时同步 | 会显著增加认证、冲突解决和数据一致性成本 |
| 复杂日历集成 | 首版只需要今日可用时间 |
| 支付系统 | 暂不公开发布 |
| 复杂依赖图 UI | 先保留数据设计, 不作为首版核心页面 |
| 自动化提醒系统 | 可在 V1.5 增加 |

## 4. 核心用户流程

### 4.1 收集流程

1. 用户打开 Inbox。
2. 输入一句原始想法。
3. 系统保存为 `InboxItem`, 状态为 `unprocessed`。
4. 用户稍后将其转为 `Task`、`Project` 或忽略。

验收标准:

- 输入为空时不能提交。
- 提交后列表立即出现新条目。
- 已转换条目不能重复转换。
- 忽略条目可恢复为待处理。

### 4.2 计划流程

1. 用户打开 Today。
2. 输入今日可用时间、精力和心情。
3. 点击生成今日计划。
4. 系统读取所有候选任务。
5. 规则引擎生成 1 个主任务和最多 3 个备选任务。
6. 系统保存 `DailyPlan`、`DailyFocus` 和评分快照。

验收标准:

- 一天只能有一个 active 计划。
- 重复生成计划时, 必须提示是覆盖还是保留原计划。
- 没有任务时, Today 显示创建任务或处理 Inbox 的入口。
- 推荐结果必须展示可解释原因。

### 4.3 执行流程

1. 用户在 Today 点击开始。
2. 系统创建 `WorkSession`, 记录 `start_at`。
3. 用户点击完成或停止。
4. 系统写入 `end_at`、`duration_min`。
5. 如果用户选择完成, 任务状态更新为 `done`。
6. 系统回写 `Task.actual_min` 和 `Project.last_active_at`。

验收标准:

- 同一时间只允许一个进行中的 WorkSession。
- 未结束的 session 再次打开页面时必须可恢复。
- 完成任务后 Today 状态立即更新。
- 实际耗时应累计到任务上。

## 5. 数据模型

### 5.1 通用约定

1. 主键统一使用 `TEXT` 类型 UUID, 便于未来同步。
2. 所有时间字段使用 ISO 8601 字符串存储。
3. 所有表保留 `created_at` 和 `updated_at`, 删除行为首版优先软删除或归档。
4. enum 在数据库层用 `TEXT` 存储, 在应用层做校验。
5. 金额、百分比等数值首版不引入复杂精度模型。

### 5.2 Domain

用途: 长期目标分组, 例如事业、学习、健康、财富。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | 是 | UUID |
| name | TEXT | 是 | 领域名称 |
| icon | TEXT | 否 | UI 图标 |
| color | TEXT | 否 | UI 颜色 |
| sort_order | INTEGER | 是 | 排序, 默认 0 |
| created_at | TEXT | 是 | 创建时间 |
| updated_at | TEXT | 是 | 更新时间 |

### 5.3 Goal

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | 是 | UUID |
| domain_id | TEXT | 否 | FK -> Domain.id |
| title | TEXT | 是 | 目标标题 |
| description | TEXT | 否 | 目标说明 |
| importance | INTEGER | 是 | 1-5 |
| start_date | TEXT | 否 | 开始日期 |
| target_date | TEXT | 否 | 目标日期 |
| status | TEXT | 是 | active / paused / completed / archived |
| progress | REAL | 是 | 0-100, 默认 0 |
| created_at | TEXT | 是 | 创建时间 |
| updated_at | TEXT | 是 | 更新时间 |

约束:

- `importance` 必须在 1 到 5。
- `status` 默认 `active`。
- `target_date` 早于今天时不自动完成, 只影响 urgency 和提醒。

### 5.4 Project

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | 是 | UUID |
| goal_id | TEXT | 否 | FK -> Goal.id |
| title | TEXT | 是 | 项目标题 |
| description | TEXT | 否 | 项目说明 |
| status | TEXT | 是 | active / paused / completed / archived |
| progress | REAL | 是 | 0-100, 默认 0 |
| start_date | TEXT | 否 | 开始日期 |
| target_date | TEXT | 否 | 目标完成日期 |
| last_active_at | TEXT | 否 | 最近推进时间 |
| created_at | TEXT | 是 | 创建时间 |
| updated_at | TEXT | 是 | 更新时间 |

约束:

- `goal_id` 允许为空, 用于未归属项目。
- 项目进度首版可由完成任务数量粗略计算。

### 5.5 Task

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | 是 | UUID |
| project_id | TEXT | 否 | FK -> Project.id |
| goal_id | TEXT | 否 | FK -> Goal.id, 用于不属于项目的任务 |
| title | TEXT | 是 | 任务标题 |
| description | TEXT | 否 | 任务说明 |
| status | TEXT | 是 | todo / doing / done / skipped / archived |
| priority_manual | INTEGER | 否 | 1-5 |
| estimate_min | INTEGER | 否 | 预计耗时 |
| actual_min | INTEGER | 是 | 累计实际耗时, 默认 0 |
| due_at | TEXT | 否 | 截止时间 |
| task_type | TEXT | 否 | deep_work / admin / learning / health / errand |
| energy_level | TEXT | 否 | low / medium / high |
| is_blocked | INTEGER | 是 | 0/1 |
| score_snapshot | TEXT | 否 | 最近评分 JSON |
| created_at | TEXT | 是 | 创建时间 |
| updated_at | TEXT | 是 | 更新时间 |

约束:

- `project_id` 和 `goal_id` 可以同时为空, 允许临时任务存在。
- `title` 不能为空。
- `estimate_min` 为空时推荐算法按 45 分钟处理。
- `done` 任务不再进入推荐候选池。

### 5.6 InboxItem

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | 是 | UUID |
| raw_text | TEXT | 是 | 原始想法 |
| source | TEXT | 是 | manual / voice / ai / imported |
| status | TEXT | 是 | unprocessed / converted / ignored / archived |
| converted_task_id | TEXT | 否 | FK -> Task.id |
| converted_project_id | TEXT | 否 | FK -> Project.id |
| converted_goal_id | TEXT | 否 | FK -> Goal.id |
| created_at | TEXT | 是 | 创建时间 |
| updated_at | TEXT | 是 | 更新时间 |

### 5.7 DailyPlan

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | 是 | UUID |
| date | TEXT | 是 | YYYY-MM-DD, 唯一 |
| available_minutes | INTEGER | 是 | 今日可用时间 |
| mood | INTEGER | 否 | 1-5 |
| energy | INTEGER | 否 | 1-5 |
| status | TEXT | 是 | draft / active / reviewed |
| created_at | TEXT | 是 | 创建时间 |
| updated_at | TEXT | 是 | 更新时间 |

约束:

- `date` 唯一。
- `available_minutes` 最小 10, 最大 720。

### 5.8 DailyFocus

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | 是 | UUID |
| daily_plan_id | TEXT | 是 | FK -> DailyPlan.id |
| task_id | TEXT | 是 | FK -> Task.id |
| rank | INTEGER | 是 | 1 为主任务, 2-4 为备选 |
| planned_minutes | INTEGER | 否 | 计划投入时长 |
| reason | TEXT | 否 | 推荐理由 |
| score_detail | TEXT | 否 | 评分明细 JSON |
| status | TEXT | 是 | planned / doing / done / missed |
| created_at | TEXT | 是 | 创建时间 |
| updated_at | TEXT | 是 | 更新时间 |

约束:

- 同一个 `daily_plan_id` 下 `rank` 唯一。
- 同一个 `daily_plan_id` 下最多 4 条 DailyFocus。

### 5.9 WorkSession

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | TEXT | 是 | UUID |
| task_id | TEXT | 是 | FK -> Task.id |
| start_at | TEXT | 是 | 开始时间 |
| end_at | TEXT | 否 | 结束时间 |
| duration_min | INTEGER | 否 | 实际时长 |
| focus_score | INTEGER | 否 | 1-5 |
| note | TEXT | 否 | 执行记录 |
| created_at | TEXT | 是 | 创建时间 |

约束:

- `end_at` 为空表示进行中。
- 应用层保证同时只有一个进行中的 session。

### 5.10 V1.5 保留表

以下表暂不作为首版 UI 核心, 但可以在数据库中保留:

- `TaskDependency`: 用于后续硬依赖和解锁价值。
- `AIRecommendationLog`: 用于后续回溯完整推荐输入。
- `DailyReview`: 用于晚间复盘和长期数据分析。

## 6. 推荐算法 V1

### 6.1 输入

| 输入 | 说明 |
| --- | --- |
| open_tasks | status 为 todo 或 doing 的任务 |
| goals | active 目标 |
| projects | active 项目 |
| available_minutes | 今日可用时间 |
| energy | 今日精力 1-5 |
| mood | 今日心情 1-5 |
| history | 最近 WorkSession 记录 |

### 6.2 候选过滤

任务进入评分前先过滤:

1. `status` 为 `done` 或 `archived` 的任务过滤。
2. `is_blocked = 1` 的任务过滤。
3. `estimate_min > available_minutes * 1.5` 的任务降级为不优先, 但不完全过滤。
4. `project.status` 或 `goal.status` 为 paused/archived 的任务过滤。

### 6.3 特征计算

所有特征统一输出 0-100。

#### long_term_value

```
goal_importance = goal.importance or 3
long_term_value = goal_importance * 20
```

修正:

- 无目标任务默认 40。
- 属于 active 目标 +10, 最高 100。

#### urgency

```
if due_at is null: urgency = 30
if due_at is today or overdue: urgency = 100
if due_at within 7 days: urgency = 100 - days_until_due * 10
if due_at within 30 days: urgency = 40
else: urgency = 30
```

#### impact

首版简化:

```
impact = 50
if task.priority_manual >= 4: impact += 20
if project has <= 3 open tasks: impact += 10
if task is the only open task in project: impact += 20
```

最高 100。

#### unblock_value

首版没有复杂依赖 UI 时:

```
unblock_value = 0
```

V1.5 启用 `TaskDependency` 后:

```
unblock_value = min(100, unlocked_task_count * 25)
```

#### momentum

```
if project.last_active_at is null: momentum = 40
if days_since_project_active >= 7: momentum = 80
if days_since_project_active >= 3: momentum = 60
else: momentum = 30
```

如果目标 importance >= 4 且 3 天未推进, momentum +20, 最高 100。

#### manual_boost

```
manual_boost = (priority_manual or 0) * 20
```

#### effort_penalty

```
estimate = task.estimate_min or 45
ratio = estimate / available_minutes
if ratio <= 0.5: effort_penalty = 10
if ratio <= 1.0: effort_penalty = 30
if ratio <= 1.5: effort_penalty = 70
else: effort_penalty = 100
```

#### fatigue_penalty

首版根据最近 3 次 WorkSession 判断:

```
if recent same task_type count >= 3: fatigue_penalty = 70
if recent same task_type count == 2: fatigue_penalty = 40
else: fatigue_penalty = 10
```

如果今日 energy <= 2 且 task.energy_level = high, fatigue_penalty 至少为 70。

#### blocked_penalty

```
if is_blocked: blocked_penalty = 100
else: blocked_penalty = 0
```

### 6.4 评分公式

```
priority_score =
  0.30 * long_term_value
+ 0.20 * urgency
+ 0.20 * impact
+ 0.15 * unblock_value
+ 0.10 * momentum
+ 0.05 * manual_boost
- 0.15 * effort_penalty
- 0.10 * fatigue_penalty
- 0.20 * blocked_penalty
```

排序规则:

1. 按 `priority_score` 从高到低排序。
2. 分数相同时, 优先选择估时更适配今日可用时间的任务。
3. 再相同时, 优先选择更久未推进项目下的任务。
4. 再相同时, 优先选择创建更早的任务。

### 6.5 无候选任务处理

| 情况 | 处理 |
| --- | --- |
| 没有任何任务 | 引导用户处理 Inbox 或创建任务 |
| 所有任务都太大 | 自动建议生成 25-45 分钟推进子任务 |
| 所有任务都无截止日期 | urgency 默认 30, 不让长期任务被完全忽略 |
| 用户选择非推荐任务 | 允许执行, 记录为手动选择 |

### 6.6 推荐理由模板

```
推荐任务: {task.title}

推荐原因:
1. 它属于目标「{goal.title}」, 长期价值评分为 {long_term_value}。
2. 它会推进项目「{project.title}」, 当前项目已 {days_since_project_active} 天未推进。
3. 预计耗时 {estimate_min} 分钟, 与今天可用时间 {available_minutes} 分钟匹配。

主要分数:
- 长期价值: {long_term_value}
- 紧急度: {urgency}
- 影响力: {impact}
- 努力成本惩罚: {effort_penalty}

备选任务:
- {alt_1}
- {alt_2}
- {alt_3}
```

## 7. 页面规格

### 7.0 移动端导航与布局

前端按移动端竖屏优先设计, 整体采用固定底部 Tab 导航:

| Tab | 路由 | 内容 |
| --- | --- | --- |
| 今日 | `/` | 今日状态输入、主任务、备选任务、进行中计时 |
| 任务 | `/tasks` | 任务列表 + 目标/项目结构 + 项目 AI 拆解 |
| 收集 | `/inbox` | Inbox 列表、转任务、AI 拆解 |
| 复盘 | `/review` | 晚间复盘草稿 |
| 我的 | `/settings` | JSON 备份导入导出、算法权重查看 |

布局原则:

1. 单页面单职责, 不在一个页面堆叠多个创建表单和多个列表。
2. 创建动作 (新建任务/目标/项目、写 Inbox) 统一收进底部抽屉 (Sheet), 按需唤起。
3. 触控目标不小于 44px, 内容容器最大宽度约束为移动端尺寸 (max-w-app)。
4. 底部预留导航栏高度与设备安全区 (safe-area-inset)。
5. 视觉风格由 Tailwind 主题 token 统一, 设计变量集中在 `globals.css` 的 `:root`。

### 7.1 Today 首页

目标: 用户每天打开 App 后可以立刻知道下一步做什么。

模块:

1. 今日状态输入: 可用时间、精力、心情。
2. 今日主任务: 标题、项目/目标、估时、推荐理由。
3. 备选任务: 最多 3 个。
4. 执行操作: 开始、完成、跳过、换一个。
5. 进行中状态: 当前 session 计时、停止、完成。
6. 快速创建入口: 顶部「+ 创建」唤起底部抽屉, 可新建任务/目标/项目或写 Inbox。

验收标准:

- 首屏必须看到主任务。
- 推荐理由不能隐藏在二级页面。
- 开始任务后页面展示进行中状态。
- 完成任务后更新任务状态和 DailyFocus 状态。
- 跳过任务时必须填写可选原因或直接跳过, 不能阻断流程。
- 页面不常驻创建表单, 创建动作通过底部抽屉完成。

### 7.2 Inbox 收集箱

目标: 降低记录门槛。

模块:

1. 快速输入框。
2. 待处理列表。
3. 转任务。
4. 转项目。
5. 转目标。
6. 忽略/恢复。

验收标准:

- 输入后 1 秒内完成保存和刷新。
- 转任务时只要求标题, 其他字段可选。
- 转换成功后 InboxItem 状态变为 `converted`。
- 原始文本必须保留。

### 7.3 Goals 目标页

目标: 管理长期方向。

模块:

1. 领域筛选。
2. 目标列表。
3. 目标详情。
4. 目标下项目列表。
5. 目标进度。

验收标准:

- 可以创建无领域目标。
- 可以暂停和归档目标。
- paused/archived 目标下任务默认不进入 Today 推荐。

### 7.4 Projects 项目页

目标: 管理可执行结构。

模块:

1. 项目列表。
2. 项目详情。
3. 任务列表。
4. 新建任务。
5. 项目进度。

验收标准:

- 项目可不绑定目标。
- 任务列表支持 todo/doing/done/skipped 筛选。
- 完成任务后项目进度更新。
- 项目详情能看到 last_active_at。

### 7.5 Task 任务详情

目标: 提供任务执行所需上下文。

模块:

1. 标题和描述。
2. 状态。
3. 估时。
4. 截止时间。
5. 手动优先级。
6. 类型和精力要求。
7. 执行记录。

验收标准:

- 修改字段后保存成功并刷新。
- done 任务不能开始新的 WorkSession, 除非用户重新打开任务。
- 任务可从项目中移除, 成为独立任务。

### 7.6 Settings 设置

移动端导航标签显示为「我的」, 首版只做最小设置:

1. 默认每日可用时间。
2. JSON 导出。
3. JSON 导入。
4. 算法权重查看。

首版不要求用户调整权重, 只展示默认值。

## 8. API 规格

如果使用 Next.js API routes 或 server actions, 按以下行为实现。

### 8.1 Inbox

#### POST /api/inbox

请求:

```json
{
  "raw_text": "开发 Next 的首页"
}
```

响应:

```json
{
  "id": "uuid",
  "raw_text": "开发 Next 的首页",
  "status": "unprocessed"
}
```

#### POST /api/inbox/{id}/convert-task

请求:

```json
{
  "title": "开发 Next 的首页",
  "project_id": null,
  "estimate_min": 45
}
```

行为:

- 创建 Task。
- 更新 InboxItem 为 `converted`。
- 写入 `converted_task_id`。

### 8.2 Goals

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /api/goals | 读取目标列表 |
| POST | /api/goals | 创建目标 |
| PATCH | /api/goals/{id} | 更新目标 |
| DELETE | /api/goals/{id} | 归档目标 |

### 8.3 Projects

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /api/projects | 读取项目列表 |
| POST | /api/projects | 创建项目 |
| GET | /api/projects/{id} | 项目详情 |
| PATCH | /api/projects/{id} | 更新项目 |
| GET | /api/projects/{id}/tasks | 读取项目任务 |

### 8.4 Tasks

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /api/tasks | 读取任务列表 |
| POST | /api/tasks | 创建任务 |
| GET | /api/tasks/{id} | 任务详情 |
| PATCH | /api/tasks/{id} | 更新任务 |
| POST | /api/tasks/{id}/reopen | 重新打开完成任务 |

### 8.5 Daily Plan

#### POST /api/daily-plan/generate

请求:

```json
{
  "date": "2026-06-05",
  "available_minutes": 180,
  "energy": 4,
  "mood": 3,
  "overwrite": false
}
```

响应:

```json
{
  "daily_plan_id": "uuid",
  "main_focus": {
    "task_id": "uuid",
    "rank": 1,
    "reason": "推荐理由",
    "score_detail": {}
  },
  "alternatives": []
}
```

错误:

- 如果当天已有 active plan 且 `overwrite=false`, 返回 409。

### 8.6 Work Sessions

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | /api/work-sessions/start | 开始任务 |
| POST | /api/work-sessions/{id}/finish | 结束任务 |
| GET | /api/work-sessions/active | 读取当前进行中的 session |

开始请求:

```json
{
  "task_id": "uuid"
}
```

结束请求:

```json
{
  "status": "done",
  "focus_score": 4,
  "note": "完成了首页布局"
}
```

## 9. 开发里程碑

### Milestone 1: 数据层和基础 CRUD

目标: 可以创建目标、项目、任务和 Inbox。

交付:

1. Prisma schema。
2. SQLite migration。
3. Seed 数据。
4. Goal/Project/Task/Inbox 基础 API。

验收:

- 能从 UI 创建任务。
- 能从 Inbox 转任务。
- 数据刷新后仍然存在。

### Milestone 2: Today 和规则推荐

目标: 能生成今日主任务。

交付:

1. DailyPlan 表。
2. DailyFocus 表。
3. 推荐算法函数。
4. Today 页面。

验收:

- 输入可用时间后生成 1+3 推荐。
- 推荐理由可见。
- 重复生成时有覆盖保护。

### Milestone 3: 执行记录

目标: 完成执行闭环。

交付:

1. WorkSession API。
2. 开始/结束任务。
3. 实际耗时回写。
4. 项目 last_active_at 回写。

验收:

- 开始任务后刷新页面仍保持进行中。
- 完成任务后 Task 状态变为 done。
- actual_min 正确累计。

### Milestone 4: AI 辅助

目标: 接入大模型做辅助文本能力, 不改变本地规则主导权。

交付:

1. Inbox 内容拆解为任务建议。
2. 项目拆解为任务建议。
3. 推荐理由润色。
4. 晚间复盘总结草稿。

验收:

- AI 生成结果需要用户确认后才能写入数据库。
- AI 失败时不影响本地规则推荐。

### Milestone 5: 备份与稳定性

目标: 个人长期使用不丢数据。

交付:

1. JSON 导出。
2. JSON 导入。
3. 错误提示。
4. 空状态页面。

验收:

- 导出文件可重新导入。
- 导入重复数据时有处理策略。
- 常见空状态不出现白屏。

### Milestone 6: 移动端前端重构

目标: 把面向桌面的单页堆叠界面重构为移动端优先的多页结构, 不改动后端 API、推荐算法和数据库。

交付:

1. 启用 Tailwind, 把设计变量映射为主题 token。
2. 底部 5 Tab 导航 (今日/任务/收集/复盘/我的)。
3. 拆分页面: Today 仅保留今日闭环, 任务与目标/项目结构迁至 `/tasks`, Inbox 迁至 `/inbox`。
4. 创建动作收进底部抽屉 (Sheet)。
5. 抽取共享前端层: `lib/client` (http/format/types/数据 hook) 与复用组件 (ui/layout/today/forms)。

验收:

- 五个 Tab 路由可切换, 当前 Tab 高亮。
- 各创建抽屉可唤起、提交、关闭。
- 原有功能 (推荐、执行计时、AI 拆解、复盘、备份) 行为不变。
- 移动端窄屏无横向溢出, 内容不被底部导航遮挡。
- 关闭 AI 配置后核心流程仍完整可用。

### Milestone 7: 安卓 APK 与本地数据 (规划中)

目标: 封装为可离线使用的安卓 APK。

计划交付:

1. 数据层从服务端 SQLite 迁移至设备本地存储 (IndexedDB), 推荐算法纯函数复用。
2. 使用 Capacitor 打包 APK。
3. AI Key 处理策略 (单人使用首版接受打入包内, 纯离线)。
4. 应用图标、启动屏、安全区适配收尾。

注: 本里程碑为独立后续阶段, 不属于当前 MVP 闭环。

## 10. 测试要求

### 10.1 单元测试

必须覆盖:

1. 推荐算法评分。
2. urgency 计算。
3. effort_penalty 计算。
4. momentum 计算。
5. WorkSession duration 计算。

### 10.2 集成测试

必须覆盖:

1. Inbox 转 Task。
2. 生成 DailyPlan。
3. 开始并完成 WorkSession。
4. 完成任务后项目 last_active_at 更新。

### 10.3 UI 验收

必须手动检查:

1. Today 首页空状态。
2. 有任务但没有计划的状态。
3. 进行中任务状态。
4. 计划已生成状态。
5. 移动端窄屏显示。
6. 底部 5 Tab 切换与当前 Tab 高亮。
7. 创建抽屉的唤起、提交与关闭。
8. 内容不被底部导航栏遮挡, 无横向滚动。

## 11. 风险与处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| MVP 过大 | 开发迟迟不能闭环 | 先完成 Inbox -> Task -> Today -> WorkSession |
| AI 依赖过强 | 没有模型就不能用 | 本地规则必须独立可用 |
| 任务必须分类 | 收集门槛变高 | Task 允许无 project/goal |
| 数据丢失 | 本地文件损坏 | 首版加入 JSON 导出 |
| 推荐不可解释 | 用户不信任结果 | 保存 score_detail 并展示理由 |
| 算法过拟合设想 | 没有真实使用数据 | 2-4 周后再调权重 |

## 12. 首版完成定义

当以下条件全部满足时, MVP 可以视为完成:

1. 用户可以把脑中想法快速记录到 Inbox。
2. 用户可以把 Inbox 条目转成任务。
3. 用户可以创建目标、项目和任务。
4. 用户每天可以生成一个主任务和三个备选任务。
5. 推荐结果有可解释理由。
6. 用户可以开始、结束并完成任务。
7. 实际耗时会写回任务。
8. 项目最近推进时间会更新。
9. 数据可以导出备份。
10. 不接入 AI 时, 核心流程仍然完整可用。

## 13. 开工清单

开发开始前确认以下事项:

1. 仓库初始化完成。
2. Next.js、TypeScript、Prisma、SQLite 安装完成。
3. Prisma schema 按本规格建表。
4. Seed 至少包含 1 个目标、1 个项目、5 个任务、3 个 Inbox 条目。
5. Today 页面作为默认首页。
6. 推荐算法先写纯函数, 再接 API。
7. 每个 milestone 完成后再进入下一阶段。

