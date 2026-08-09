import { describe, it, expect } from "vitest";
import { segmentBigrams, ftsPhraseQuery, shouldUseFts } from "../../src/storage/fts-bigrams.js";

describe("fts-bigrams（FTS5 中文 bigram 预切分）", () => {
  it("segmentBigrams：中文重叠二元组", () => {
    expect(segmentBigrams("这是一个示例")).toBe("这是 是一 一个 个示 示例");
  });

  it("segmentBigrams：中英混排按空白分词，ASCII 小写", () => {
    expect(segmentBigrams("Java 入门")).toBe("ja av va 入门");
  });

  it("segmentBigrams：单字词/空串跳过", () => {
    expect(segmentBigrams("中")).toBe("");
    expect(segmentBigrams("")).toBe("");
  });

  it("ftsPhraseQuery：多字关键词转短语（AND 语义）", () => {
    expect(ftsPhraseQuery("这是一个")).toBe('"这是 是一 一个"');
    expect(ftsPhraseQuery("Java 入门")).toBe('"ja av va" "入门"');
  });

  it("ftsPhraseQuery：剥离词内双引号防注入", () => {
    expect(ftsPhraseQuery('示"例')).toBe('"示例"');
  });

  it("ftsPhraseQuery：1 字/纯标点/空 → null（调用方回退 LIKE）", () => {
    expect(ftsPhraseQuery("中")).toBeNull();
    expect(ftsPhraseQuery("!!")).toBeNull();
    expect(ftsPhraseQuery("  ")).toBeNull();
    expect(ftsPhraseQuery("")).toBeNull();
  });

  it("shouldUseFts：2 字以上走 FTS，否则回退 LIKE", () => {
    expect(shouldUseFts("示例")).toBe(true);
    expect(shouldUseFts("ai")).toBe(true);
    expect(shouldUseFts("中")).toBe(false);
    expect(shouldUseFts("!!")).toBe(false);
  });
});
