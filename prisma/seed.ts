import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const now = () => new Date().toISOString();

async function main() {
  const timestamp = now();

  const domainData = {
    name: "事业",
    icon: "briefcase",
    color: "#2563eb",
    sortOrder: 1,
    updatedAt: timestamp,
  };

  const domain = await prisma.domain.upsert({
    where: { id: "domain-career" },
    update: domainData,
    create: {
      id: "domain-career",
      ...domainData,
      createdAt: timestamp,
    },
  });

  const goalData = {
    domainId: domain.id,
    title: "完成 Next MVP",
    description: "形成从 Inbox 到任务执行的本地优先闭环。",
    importance: 5,
    status: "active",
    progress: 10,
    updatedAt: timestamp,
  };

  const goal = await prisma.goal.upsert({
    where: { id: "goal-next-mvp" },
    update: goalData,
    create: {
      id: "goal-next-mvp",
      ...goalData,
      createdAt: timestamp,
    },
  });

  const projectData = {
    goalId: goal.id,
    title: "Milestone 1 数据层和基础 CRUD",
    description: "建立 SQLite 数据层、基础 API 和最小 UI。",
    status: "active",
    progress: 20,
    updatedAt: timestamp,
  };

  const project = await prisma.project.upsert({
    where: { id: "project-next-m1" },
    update: projectData,
    create: {
      id: "project-next-m1",
      ...projectData,
      createdAt: timestamp,
    },
  });

  const tasks = [
    ["task-prisma-schema", "完成 Prisma schema", 45, "deep_work", "high", 5],
    ["task-basic-api", "实现基础 CRUD API", 60, "deep_work", "high", 5],
    ["task-inbox-ui", "搭建 Inbox 收集和转任务 UI", 45, "admin", "medium", 4],
    ["task-task-ui", "搭建任务创建 UI", 45, "admin", "medium", 4],
    ["task-persistence-check", "验证刷新后数据仍然存在", 25, "admin", "low", 3],
  ] as const;

  for (const [id, title, estimateMin, taskType, energyLevel, priorityManual] of tasks) {
    const taskData = {
      projectId: project.id,
      goalId: goal.id,
      title,
      priorityManual,
      estimateMin,
      taskType,
      energyLevel,
      updatedAt: timestamp,
    };

    await prisma.task.upsert({
      where: { id },
      update: taskData,
      create: {
        id,
        ...taskData,
        status: "todo",
        actualMin: 0,
        isBlocked: false,
        createdAt: timestamp,
      },
    });
  }

  const inboxItems = [
    ["inbox-home-layout", "Today 首页首屏要直接看到主任务"],
    ["inbox-export-json", "后续加入 JSON 备份导出"],
    ["inbox-review-copy", "推荐理由需要能解释分数来源"],
  ] as const;

  for (const [id, rawText] of inboxItems) {
    const inboxData = {
      rawText,
      source: "manual",
      updatedAt: timestamp,
    };

    await prisma.inboxItem.upsert({
      where: { id },
      update: inboxData,
      create: {
        id,
        ...inboxData,
        status: "unprocessed",
        createdAt: timestamp,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
