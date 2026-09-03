import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base 使用相对路径:构建产物可部署在任意子路径(GitHub Pages 项目页
// https://<user>.github.io/<repo>/),本地 npm run dev 也不受影响。
// 代码中的 public 资源引用统一用 import.meta.env.BASE_URL 前缀。
export default defineConfig({
  plugins: [react()],
  base: "./",
});
