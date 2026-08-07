import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 测试文件目录
    include: ["test/**/*.test.ts"],
    // ESM 模式（匹配 package.json type: module）
    // vitest 自动处理 .ts 文件（不需要额外 ts-node 等）
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    },
  },
});
