# scripts/

运维、环境安装、数据初始化相关脚本目录。

## 用途示例

- 环境初始化：安装依赖、创建 `.venv`、配置 `.env`
- 数据库迁移辅助：执行 D1 migration、导入种子数据
- 历史数据生成：调用 `tests/testdata/prepare_history_seed.py` 等工具

## 常用命令

```bash
# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 生成当前 schema 兼容 seed（用于测试环境历史基线导入）
.venv/bin/python tests/testdata/prepare_history_seed.py \
  tests/testdata/test_week_seed_20260315.sql \
  tests/testdata/_generated_history_seed.sql

# 生成 replay fixtures
.venv/bin/python tests/testdata/build_replay_fixtures.py
```
