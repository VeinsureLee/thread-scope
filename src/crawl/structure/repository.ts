import { routes, fillRoute, secrets } from "../../core/config.js";
import { ajaxGet } from "../../core/http-client.js";

/**
 * AJAX 响应中的原始条目。
 *
 * 通过 t 字段 <a> 的 href 判断节点类型：
 *   /board/{ename}   → 版块（leaf）
 *   /section/{id}    → 分区（branch，可继续递归）
 */
export interface AjaxEntry {
  t: string;  // HTML 片段，例如 '<a href="/board/Advice">意见与建议</a>'
  id: string; // AJAX 中 child 的 id 属性（非递归 key，仅作参考）
}

/**
 * 分区树数据访问接口。
 *
 * 抽成接口是为了让递归算法（tree.ts）不直接依赖 HTTP：
 * 测试可注入 fake 实现，无需真实网络。
 */
export interface SectionRepository {
  /** 获取指定父节点下的子节点列表 */
  listChildren(parentId: string): Promise<AjaxEntry[]>;
  /** 获取分区详情页 HTML */
  getSectionDetail(sectionId: string): Promise<string>;
}

/** 基于 HTTP + AJAX 接口的默认实现 */
export class HttpSectionRepository implements SectionRepository {
  async listChildren(parentId: string): Promise<AjaxEntry[]> {
    const param = routes.tree_recursive_param;
    const path = `${routes.sections_ajax}?uid=${secrets.userId}&${param}=${parentId}`;
    const json = await ajaxGet(path);
    return JSON.parse(json) as AjaxEntry[];
  }

  async getSectionDetail(sectionId: string): Promise<string> {
    return ajaxGet(fillRoute(routes.section_detail, { sectionId }));
  }
}
