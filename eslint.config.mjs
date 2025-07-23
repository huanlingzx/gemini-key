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
      // 修改 react/no-unescaped-entities 规则
      // 保持规则为 "error"，但通过 "skip" 选项允许双引号
      "react/no-unescaped-entities": [
        "error", // 保持为错误级别，以捕获其他未转义的实体
        {
          "skip": ["\""] // 在 skip 数组中添加双引号，表示忽略此字符的检查
        }
      ]
    }
  }
];

export default eslintConfig;
