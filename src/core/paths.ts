import * as path from "path";
import { fileURLToPath } from "url";

/**
 * 项目根目录绝对路径（基于源码文件位置推导，不依赖 process.cwd()）。
 *
 * 背景：MCP 服务器可能由客户端从任意工作目录 spawn（如 `cc switch` 从
 * user 级配置启动时 cwd 是 Claude Code 自己的目录，不是项目根）。
 * 所有相对路径（config/、data/、.env、日志）都必须锚定到项目根，否则
 * cwd ≠ 项目根时模块加载即崩溃。
 *
 * 本文件位于 src/core/，向上两级即项目根。
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 项目根绝对路径（常量，模块加载期确定） */
export const PROJECT_ROOT: string = ROOT;

/** 解析相对项目根的绝对路径（绝对路径原样返回） */
export function fromRoot(relative: string): string {
  return path.resolve(PROJECT_ROOT, relative);
}
