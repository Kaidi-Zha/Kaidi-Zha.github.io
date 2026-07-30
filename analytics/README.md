# 网站流量追踪（自托管分析）

主页是纯静态 GitHub Pages 站点，本目录提供一个**自己拥有的**流量收集后端：
Cloudflare Worker（免费层）+ D1 数据库 + 密码后台 + 每周邮件汇总。

- 前台完全无感：页面只异步发送一条 beacon，无任何可见元素
- 数据只归你：浏览量、访客、IP、国家/城市，存在你自己的 Cloudflare D1 里
- 两个查看入口：受密码保护的 `/admin` 后台页 + 每周一早上发到邮箱的周报

## 为什么不用 GitHub Actions / GitHub 自带统计

查证过官方文档后排除：

1. **GitHub Pages 无服务器日志**，Actions 是事件触发的 CI 运行器，不是常驻
   HTTP 服务——访客打开页面那一刻没有任何 GitHub 代码在运行，无法接收
   浏览器的浏览上报。"Actions 动态编译"只发生在构建/部署时刻。
2. **GitHub Traffic API**（`/repos/{owner}/{repo}/traffic/views`）只统计
   github.com 上**仓库页面**的浏览（14 天窗口），不覆盖 Pages 站点访问，
   且不提供访客 IP。
3. **Actions 定时任务的 60 天限制**（官方文档原文）：*"In a public
   repository, scheduled workflows are automatically disabled when no
   repository activity has occurred in 60 days."* 个人主页容易 60 天无提交，
   周报 workflow 会被自动禁用。Worker 的 cron trigger 没有此限制。

## 一次性部署（约 15 分钟）

前置：一个 Cloudflare 账号（免费）、一个 Resend 账号（免费，resend.com）。

```bash
cd analytics

# 1. 安装并登录 wrangler
npm install -g wrangler
wrangler login

# 2. 创建 D1 数据库，把输出里的 database_id 填进 wrangler.toml
wrangler d1 create kaidi-analytics
# 注意必须加 --remote：不加的话默认只建本地开发库，线上依然没有表
wrangler d1 execute kaidi-analytics --remote --file=schema.sql

# 3. 设置三个密钥（都不会出现在代码和网页里）
wrangler secret put ADMIN_TOKEN      # 自设一个强密码，用于后台访问
wrangler secret put RESEND_API_KEY   # resend.com → API Keys → Create
wrangler secret put REPORT_EMAIL     # 接收周报的邮箱

# 4. 部署
wrangler deploy                     # 输出 https://kaidi-analytics.<子域>.workers.dev

# 5. 把 worker 域名填回前端（只需改这一个文件）
#    编辑 ../assets/js/analytics.js，把 YOUR_SUBDOMAIN 换成上面的子域
```

Resend 免费说明：未验证自有域名时，发件人用 `onboarding@resend.dev`，
**只能发送到你自己注册 Resend 的那个邮箱**——周报场景正好够用。
想发给别的邮箱，需在 Resend 验证一个自有域名后修改 worker.js 里的 from。

## 日常使用

- **后台**：浏览器打开
  `https://kaidi-analytics.<子域>.workers.dev/admin?token=<ADMIN_TOKEN>`
  可加 `&days=90` 调整统计窗口（默认 30 天）。请收藏此 URL 且勿外传。
- **周报**：每周一 09:00（北京时间）自动发送上周汇总到 REPORT_EMAIL。
- **手动触发周报测试**：`wrangler dev --test-scheduled` 后访问
  `http://localhost:8787/cdn-cgi/handler/scheduled`，或部署后在
  Cloudflare Dashboard → Worker → Triggers 里手动触发。

## 隐私说明

IP 属于个人信息。数据仅存于你自己的 D1，不向任何第三方分析商发送；
建议不要把后台 URL 或截图公开分享。如需进一步克制，可在 worker.js 的
collect 里对 IP 做截断（如只保留 /24 前缀）后再入库。
