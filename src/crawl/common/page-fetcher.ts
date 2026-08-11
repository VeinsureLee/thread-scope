import { ajaxGet, clearCookie } from "../../core/http-client.js";
import { http, sessionExpired } from "../../core/config.js";
import { logWarn } from "../../logging/logger.js";

/**
 * 会话过期/未登录错误：命中强特征时抛出，不参与重试（重试只会重复请求登录页）。
 */
export class SessionExpiredError extends Error {
  constructor(signal: string) {
    super(
      `会话已过期或未登录（页面特征: ${signal}），请重新调用 forum-login 后再试`,
    );
    this.name = "SessionExpiredError";
  }
}

/** 检测强特征：命中任一 → 返回特征串（未命中返回 null） */
function detectSessionExpired(html: string): string | null {
  for (const signal of sessionExpired.html_signals ?? []) {
    if (signal && html.includes(signal)) return signal;
  }
  return null;
}

/** 检测弱特征：命中任一 → 返回特征串（仅用于诊断日志，不抛错） */
function detectSuspicious(html: string): string | null {
  for (const signal of sessionExpired.suspicious_signals ?? []) {
    if (signal && html.includes(signal)) return signal;
  }
  return null;
}

/**
 * 统一页面抓取器：在 ajaxGet 之上叠加【限速】与【重试】。
 *
 * 设计（见 docs/01 §4.2、docs/03 §4）：
 * - 所有领域模块的"拉 HTML 页面"都走这里，保证全站请求频率受控、失败可重试；
 * - 限速策略：两次请求最小间隔 `request_interval_ms`（config/rules/http.yaml），
 *   默认 20ms = 1 秒 50 次；
 * - 重试策略（已验收）：失败重试 3 次（共 4 次尝试）；
 * - 会话过期检测：HTML 命中强特征（未登录页）→ 立即抛错不重试；弱特征仅记 warn；
 * - 同一时刻只允许一个"等间距"请求序列（令牌队列），翻页并发时也不会突刺。
 */
export class PageFetcher {
  private readonly intervalMs: number;
  private readonly maxRetries: number;
  /** 下一次允许发请求的时间戳（实现限速） */
  private nextAllowedAt = 0;

  constructor(opts: { intervalMs?: number; maxRetries?: number } = {}) {
    // 默认间隔从配置读取（http.request_interval_ms，默认 20ms）
    this.intervalMs = opts.intervalMs ?? http.request_interval_ms;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  /**
   * 抓取页面 HTML（限速 + 重试 + 会话过期检测）。
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
        const html = await fetcher(path);

        // 会话过期检测：强特征 → 抛错不重试，并清除本地 Cookie（下次 requireLogin 即提示未登录）
        const expiredSignal = detectSessionExpired(html);
        if (expiredSignal) {
          clearCookie();
          throw new SessionExpiredError(expiredSignal);
        }
        // 弱特征 → 仅记 warn（选择器失效/站点改版诊断）
        const suspiciousSignal = detectSuspicious(html);
        if (suspiciousSignal) {
          logWarn("crawl", {
            message: "页面疑似未登录/异常（弱特征命中，仅诊断）",
            path,
            signal: suspiciousSignal,
            htmlLength: html.length,
          }, "crawl.session");
        }

        return html;
      } catch (err) {
        // 会话过期不重试：重试只会重复抓登录页
        if (err instanceof SessionExpiredError) throw err;
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
