/**
 * 数据库维护脚本（npm run maintain）。
 *
 * 职责（对应中优先级「数据库增长治理」）：
 * 1. 对两个库执行 `wal_checkpoint(TRUNCATE)` + `VACUUM` —— 回收 WAL 文件、
 *    压缩删除/更新留下的文件空洞（内容库是增量累积型，长期运行后体积会虚涨）；
 * 2. 重建 forum-content.db 的 FTS5 bigram 索引 —— 保证全文索引与基表一致
 *    （bigram 预切分设计，不能用 FTS5 原生 rebuild，见 ContentDb.rebuildFts 注释）；
 * 3. 输出各表统计与最新抓取时间 —— 便于判断数据规模与新鲜度。
 *
 * 用法: npm run maintain
 * 特点: 纯本地操作（不联网、不需要登录）；可定期手动执行。
 */
import * as fs from "fs";
import * as path from "path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "../src/storage/db-common.js";
import { ContentDb } from "../src/storage/content-db.js";
import { TrafficDb } from "../src/storage/traffic-db.js";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** 对单个 db 文件做 WAL checkpoint + VACUUM（文件不存在则跳过） */
function vacuumFile(name: string): void {
  const file = path.join(dataDir(), name);
  if (!fs.existsSync(file)) {
    console.log(`- ${name}: 不存在，跳过`);
    return;
  }
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    db.exec("VACUUM;");
    const size = fs.statSync(file).size;
    console.log(`✓ ${name}: WAL checkpoint + VACUUM 完成（${formatBytes(size)}）`);
  } finally {
    db.close();
  }
}

function main(): void {
  console.log("── 数据库维护开始 ──");
  vacuumFile("forum-content.db");
  vacuumFile("forum-traffic.db");

  const content = new ContentDb();
  try {
    content.rebuildFts();
    console.log("✓ forum-content.db: FTS5 bigram 索引重建完成");
    const s = content.stats();
    console.log(
      `  board=${s.board}  article=${s.article}  post=${s.post}  user=${s.user}`,
    );
    console.log(`  最新抓取: ${s.latestCrawledAt ?? "无"} | 文件大小: ${formatBytes(s.fileBytes)}`);
  } finally {
    content.close();
  }

  const traffic = new TrafficDb();
  try {
    const s = traffic.stats();
    console.log(
      `✓ forum-traffic.db: snapshots=${s.snapshots} | 采样区间 ${s.earliest ?? "-"} → ${s.latest ?? "-"}`,
    );
  } finally {
    traffic.close();
  }
  console.log("── 数据库维护结束 ──");
}

main();
