import * as fs from "fs";
import * as path from "path";

// ========== JSON 存储（轻量数据：论坛结构、版块统计） ==========

/** 获取 data 目录路径 */
export function getDataDir(): string {
  const dir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** 从 JSON 文件读取数据 */
export function readJson<T>(filename: string): T | null {
  const filePath = path.join(getDataDir(), filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** 将数据写入 JSON 文件 */
export function writeJson(filename: string, data: unknown): void {
  const filePath = path.join(getDataDir(), filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ========== SQLite 存储（帖子内容、回复）— 待实现 ==========

/**
 * 【计划中】获取 SQLite 数据库连接。
 * 依赖 better-sqlite3，届时添加。
 */
// export function getDb(): Database.Database { ... }
