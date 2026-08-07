import * as fs from "fs";
import * as path from "path";
import { fromRoot } from "../core/paths.js";

/**
 * JSON 文件存储（轻量数据：论坛结构快照 structure-overview.json 等）。
 *
 * 与 SQLite（content-db / traffic-db）分工：结构化、需查询的数据进 SQLite；
 * 一次性快照（如完整论坛树）用 JSON 文件，整体读、整体写。
 */

/** 获取 data 目录路径（锚定项目根） */
export function getDataDir(): string {
  const dir = fromRoot("data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** 从 JSON 文件读取数据 */
export function readJson<T>(filename: string): T | null {
  const filePath = resolvePath(filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** 将数据写入 JSON 文件（整体覆盖） */
export function writeJson(filename: string, data: unknown): void {
  const filePath = resolvePath(filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/** 解析存储路径：绝对路径原样使用，否则落到 data 目录 */
function resolvePath(filename: string): string {
  if (path.isAbsolute(filename)) return filename;
  return path.join(getDataDir(), filename);
}
