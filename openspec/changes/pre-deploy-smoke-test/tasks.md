## 1. Worker API 基础验证

- [x] 1.1 `GET /api/health` 返回 `{ ok: true, env: "test" }`
- [x] 1.2 `GET /api/news?limit=5` 返回正常结构（含 items 数组）
- [x] 1.3 `GET /api/reviews?limit=5` 返回正常结构
- [x] 1.4 `GET /api/screening-keywords?active=1` 返回关键词列表（SM-010）

## 2. SM-013：reviewed 记录保护验证

- [x] 2.1 初始化一条测试记录：`POST /api/reviews/2026-03-21/initialize`
- [x] 2.2 完成复盘：`POST /api/reviews/2026-03-21/complete`，确认返回 `reviewStatus: reviewed`
- [x] 2.3 再次 initialize：`POST /api/reviews/2026-03-21/initialize`，确认返回 `{ ok: true, skipped: true, reason: "already reviewed" }`
- [x] 2.4 查询记录确认状态未变：`GET /api/reviews/2026-03-21/bootstrap`，`review_status` 仍为 `reviewed`

## 3. 前端交互验证（手动，http://localhost:8788）

- [ ] 3.1 打开复盘抽屉，确认"已初始化"按钮为 disabled 状态
- [ ] 3.2 完成一次复盘后，确认按钮变为"编辑"且可点击
- [ ] 3.3 点击"编辑"进入编辑模式，修改内容后点击"保存"，确认保存成功
- [ ] 3.4 点击"退出编辑"退出，确认内容保留
- [ ] 3.5 DevTools Console 无 JS 报错

## 4. Pipeline dry-run 验证

- [ ] 4.1 运行 `python src/collect_news_v3.py`（ENABLE_REMOTE_WRITE=false），确认日志含关键词来源（API 或 FALLBACK）且无异常退出
- [ ] 4.2 若有 reviewed 记录，确认日志含"跳过初始化复盘记录（已完成复盘）"warning

## 5. 部署上线

- [ ] 5.1 确认以上全部通过，执行 `wrangler deploy`（Worker）
- [ ] 5.2 部署后 `GET /api/health` 返回 `{ ok: true, env: "prod" }`
- [ ] 5.3 在生产环境对一条 reviewed 记录调用 initialize，确认返回 `skipped: true`
