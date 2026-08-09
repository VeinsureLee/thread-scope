/**
 * FTS5 中文检索的 bigram 预切分工具。
 *
 * 背景：SQLite FTS5 默认 unicode61 tokenizer 无法切分中文（整串视为一个 token），
 * trigram tokenizer 又要求 ≥3 字符（2 字中文关键词是常态，直接不命中）。
 * 因此采用"重叠二元组预切分"：写入时把文本切成重叠二元组存入 FTS5，
 * 搜索时对关键词做同样切分后以短语匹配。2 字及以上关键词（中/英）都能命中；
 * 1 字关键词或纯标点回退 LIKE（见 shouldUseFts）。
 */

/** 词字符（ASCII 字母/数字 + 中日韩统一表意文字）：含至少一个才参与 FTS，纯标点回退 LIKE */
const WORD_CHAR = /[a-z0-9一-鿿]/i;

/**
 * 把一段文本切成重叠二元组，空格连接（ASCII 统一小写）。
 * 按空白分词后分别切，处理中英混排；单字词自然被跳过。
 *
 * "这是一个示例" → "这是 是一 一个 个示 示例"
 * "Java 入门"    → "ja av va 入门"
 */
export function segmentBigrams(text: string): string {
  const bigrams: string[] = [];
  for (const term of text.trim().toLowerCase().split(/\s+/)) {
    if (term.length < 2) continue;
    for (let i = 0; i < term.length - 1; i++) {
      bigrams.push(term.slice(i, i + 2));
    }
  }
  return bigrams.join(" ");
}

/**
 * 把搜索关键词转为 FTS5 MATCH 表达式。
 * 每个空白词切 bigram 后包成短语，短语之间为 AND 语义；
 * 剥离词内双引号防注入；纯标点/单字词跳过。
 *
 * "这是一个"     → `"这是 是一 一个"`
 * "Java 入门"    → `"ja av va" "入门"`
 *
 * @returns 无可搜索词（全为 1 字/纯标点/空）时返回 null，调用方回退 LIKE
 */
export function ftsPhraseQuery(keyword: string): string | null {
  const phrases: string[] = [];
  for (const rawTerm of keyword.trim().toLowerCase().split(/\s+/)) {
    // 剥离词内双引号防注入（FTS5 短语中的 " 是语法字符）
    const term = rawTerm.replace(/"/g, "");
    if (term.length < 2 || !WORD_CHAR.test(term)) continue;
    const bigrams: string[] = [];
    for (let i = 0; i < term.length - 1; i++) {
      bigrams.push(term.slice(i, i + 2));
    }
    const joined = bigrams.join(" ");
    if (joined) phrases.push(`"${joined}"`);
  }
  return phrases.length > 0 ? phrases.join(" ") : null;
}

/** 关键词是否应走 FTS 路径（否则 LIKE 回退）。 */
export function shouldUseFts(keyword: string): boolean {
  return ftsPhraseQuery(keyword) !== null;
}
