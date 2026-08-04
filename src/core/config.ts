import * as dotenv from "dotenv";

dotenv.config();

/** 全局配置，从 .env 文件读取凭证 */
export const config = {
  baseUrl: process.env.BASE_URL || "",
  userId: process.env.USER_ID || "",
  userPassword: process.env.USER_PASSWORD || "",
} as const;
