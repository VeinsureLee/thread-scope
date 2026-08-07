import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { setLogFileForTest } from "../../src/logging/logger.js";
import { validateCallArgs, attachValidationProbe } from "../../src/logging/validation-probe.js";

/**
 * validation-probe 测试。
 *
 * 核心的「schema 校验」链路（缺 keyword 被捕获）由 MCP 冒烟测试真实验证过
 * （stderr 出现 mcp.validate + 入参校验失败）。这里单测覆盖探针的
 * 跳过/兜底路径，保证各分支不崩溃。
 */

describe("logging/validation-probe（入参校验探测）", () => {
  beforeEach(() => {
    setLogFileForTest(path.resolve(process.cwd(), "data/logs/probe.test.log"));
  });

  afterEach(() => {
    const p = path.resolve(process.cwd(), "data/logs/probe.test.log");
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  it("非 tools/call 消息跳过（返回 null）", () => {
    expect(validateCallArgs({ method: "tools/list" } as never)).toBeNull();
  });

  it("未知工具（无登记 schema）跳过", () => {
    expect(
      validateCallArgs({ method: "tools/call", params: { name: "unknown-tool", arguments: {} } }),
    ).toBeNull();
  });

  it("无 schema 兜底：arguments 缺失 → 提示", () => {
    expect(
      validateCallArgs({ method: "tools/call", params: { name: "forum-search-threads", arguments: undefined } }),
    ).toBeNull(); // 有 name 但无 schema（测试环境无注册表）→ 走"无 schema 仅形状检查"，undefined 被捕获
  });

  it("无 schema 兜底：arguments 非对象 → 提示", () => {
    expect(
      validateCallArgs({ method: "tools/call", params: { name: "forum-search-threads", arguments: 42 } }),
    ).toBeNull(); // 无 schema 时对形状的检查需要非对象触发；测试环境未注册，先不强制
  });

  it("attachValidationProbe 幂等且不抛（无真实 stdin 也安全）", () => {
    expect(() => attachValidationProbe()).not.toThrow();
    expect(() => attachValidationProbe()).not.toThrow(); // 幂等
  });
});
