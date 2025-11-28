import { defineConfig } from "@prisma/config";
import dotenv from "dotenv";

dotenv.config(); // ⭐⭐ 让 Prisma 读取 `.env` 文件

export default defineConfig({
  schema: "./prisma/schema.prisma",
});