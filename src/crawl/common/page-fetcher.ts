import { ajaxGet } from "../../core/http-client.js";

/**
 * 统一页面抓取器：在 ajaxGet 之上叠加【限速】与【重试】。
 *
 * 设计（见 docs/01 §4.2、docs/03 §4）：
 * - 所有领域模块的"拉 HTML 页面"都走这里，保证全站请求频率受控、失败可重试；
 * - 限速策略（已验收）：1 秒 50 次 = 每次请求至少间隔 20ms；
 * - 重试策略（已验收）：失败重试 3 次（共 4 次尝试）；
 * - 同一时刻只允许一个"等间距"请求序列（令牌队列），翻页并发时也不会突刺。
 */
export class PageFetcher {
  private readonly intervalMs: number;
  private readonly maxRetries: number;
  /** 下一次允许发请求的时间戳（实现限速） */
  private nextAllowedAt = 0;

  constructor(opts: { intervalMs?: number; maxRetries?: number } = {}) {
    // 默认 1 秒 50 次 → 20ms 间隔
    this.intervalMs = opts.intervalMs ?? 20;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  /**
   * 抓取页面 HTML（限速 + 重试）。
   *
   * @param path     相对论坛根路径，如 "/board/Beauty?p=2"（与 ajaxGet 一致）
   * @param fetcher  底层请求函数，默认 ajaxGet；测试可注入 fake
   */
  async fetch(
    path: string,
    fetcher: (p: string) => Promise<string> = ajaxGet,
  ): Promise<string> {
    await this.waitTurn();

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fetcher(path);
      } catch (err) {
        lastErr = err;
        // 失败后冷却一小段时间再重试，避免高频重试再次触发风险
        await this.wait(this.intervalMs * (attempt + 2));
      }
    }
    throw lastErr;
  }

  /** 等待直到轮到本次请求（基于 nextAllowedAt 的间距队列） */
  private async waitTurn(): Promise<void> {
    const now = Date.now();
    if (now >= this.nextAllowedAt) {
      this.nextAllowedAt = now + this.intervalMs;
      return;
    }
    const delay = this.nextAllowedAt - now;
    this.nextAllowedAt += this.intervalMs;
    await this.wait(delay);
  }

  private async wait(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** 全局默认抓取器（进程内共享同一限速队列） */
export const defaultPageFetcher = new PageFetcher();
