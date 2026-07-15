import { test } from "node:test";
import assert from "node:assert/strict";

import { durationMinutes } from "../src/lib/work-sessions.ts";

test("durationMinutes: 正常时长向上取整到分钟", () => {
  assert.equal(durationMinutes("2026-06-11T10:00:00.000Z", "2026-06-11T10:25:00.000Z"), 25);
});

test("durationMinutes: 不足一分钟向上取整为 1", () => {
  assert.equal(durationMinutes("2026-06-11T10:00:00.000Z", "2026-06-11T10:00:30.000Z"), 1);
});

test("durationMinutes: 带秒数的时长向上取整", () => {
  // 25 分 1 秒 → 26 分
  assert.equal(durationMinutes("2026-06-11T10:00:00.000Z", "2026-06-11T10:25:01.000Z"), 26);
});

test("durationMinutes: 结束早于开始返回 0", () => {
  assert.equal(durationMinutes("2026-06-11T10:25:00.000Z", "2026-06-11T10:00:00.000Z"), 0);
});

test("durationMinutes: 开始等于结束返回 0", () => {
  assert.equal(durationMinutes("2026-06-11T10:00:00.000Z", "2026-06-11T10:00:00.000Z"), 0);
});

test("durationMinutes: 非法日期返回 0", () => {
  assert.equal(durationMinutes("invalid", "2026-06-11T10:00:00.000Z"), 0);
});
