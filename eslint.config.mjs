import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // useEffect 中 fetch 数据后 setState 是 React 标准模式，禁用此规则
      "react-hooks/set-state-in-effect": "off",
      // React hooks purity/immutability 规则过于严格，禁用
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      // refs 在 render 中读写是项目中的常见模式，禁用
      "react-hooks/refs": "off",
      // React Compiler 规则对 refs/impure render 检查过于严格
      "react-compiler/react-compiler": "off",
      // any 类型在 API routes 中常见，降级为 warning
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
