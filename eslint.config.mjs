import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"), // 继承 Next.js 的核心规则
 
  // ✨ 新增一个配置对象，用于覆盖特定规则
  {
    rules: {
      // 配置 'react/no-unescaped-entities' 规则
      // "error": 表示如果违反规则，将作为错误报告
      // "forbid": 默认情况下禁止的字符（通常是 ">" 和 "}"）
      // "allow": 明确允许不转义的字符，这里我们添加了双引号 "\""
      "react/no-unescaped-entities": ["error", { "forbid": [">", "}"], "allow": ["\""] }]
    }
  }
];

export default eslintConfig;
