// next.config.js
module.exports = {
  output: 'standalone',  // 确保输出模式为 standalone
  reactStrictMode: true, // 启用 React 严格模式，帮助识别潜在问题

  // 其他配置（如果有）...
  env: {
    DATABASE_URL: process.env.DATABASE_URL,   // 确保 DATABASE_URL 被正确加载
    SHADOW_DATABASE_URL: process.env.SHADOW_DATABASE_URL,  // 加载 SHADOW_DATABASE_URL
  },
};
