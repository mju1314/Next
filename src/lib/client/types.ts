export type Goal = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  importance: number;
  startDate?: string | null;
  targetDate?: string | null;
  progress?: number;
};

export type Project = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  progress?: number;
  startDate?: string | null;
  targetDate?: string | null;
  lastActiveAt?: string | null;
  goalId: string | null;
  goal?: Goal | null;
};

export type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priorityManual: number | null;
  estimateMin: number | null;
  actualMin?: number | null;
  dueAt: string | null;
  taskType: string | null;
  energyLevel: string | null;
  isBlocked?: boolean;
  projectId: string | null;
  goalId: string | null;
  project?: Project | null;
  goal?: Goal | null;
  createdAt: string;
};

export type InboxItem = {
  id: string;
  rawText: string;
  status: string;
  convertedTaskId: string | null;
  convertedProjectId: string | null;
  convertedGoalId: string | null;
};

export type ScoreDetail = {
  score: number;
  todayMode?: "progress" | "clear" | "deadline" | "low_energy" | null;
  modeAdjustment?: number;
  longTermValue: number;
  urgency: number;
  impact: number;
  momentum: number;
  manualBoost?: number;
  effortPenalty: number;
  fatiguePenalty: number;
  energyFit?: number;
  moodFit?: number;
  historyAdjustment?: number;
  estimateMin: number;
  availableMinutes: number;
  daysUntilDue?: number | null;
  daysSinceProjectActive?: number | null;
  oversized?: boolean;
  sizeRatio?: number;
  sizeAdvice?: "consider_split" | "split_recommended" | null;
};

export type DailyFocus = {
  id: string;
  taskId: string;
  rank: number;
  plannedMinutes: number | null;
  reason: string | null;
  status: string;
  parsedScoreDetail: ScoreDetail | null;
  task: Task;
};

export type DailyPlan = {
  id: string;
  date: string;
  availableMinutes: number;
  energy: number | null;
  mood: number | null;
  status: string;
  foci: DailyFocus[];
};

export type DailyReview = {
  id: string;
  date: string;
  content: string;
  source: "manual" | "ai" | "local";
  metricsSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TodayState = {
  date: string;
  plan: DailyPlan | null;
  openTaskCount: number;
  inboxCount: number;
};

export type WorkSession = {
  id: string;
  taskId: string;
  startAt: string;
  endAt: string | null;
  durationMin: number | null;
  focusScore: number | null;
  note: string | null;
  task: Task;
};

export type TaskSuggestion = {
  title: string;
  description?: string | null;
  estimateMin?: number | null;
  priorityManual?: number | null;
  taskType?: string | null;
  energyLevel?: string | null;
  reason?: string | null;
};

export type AiCallMeta = {
  providerName: string;
  model: string;
  style: "responses" | "chat";
  durationMs: number;
  status?: number;
  endpoint: string;
};

export type AiTaskSuggestionResult = {
  suggestions: TaskSuggestion[];
  source: "ai" | "local";
  aiError?: string;
  aiErrorDetail?: string | null;
  aiMeta?: AiCallMeta;
  requiresConfirmation: boolean;
};

export type AiReasonResult = {
  polishedReason: string;
  source: "ai" | "local";
  aiError?: string;
  aiErrorDetail?: string | null;
  aiMeta?: AiCallMeta;
};
