-- Migration 009: 新增新闻来源语言和子来源字段
-- language: 新闻语言，zh=中文，en=英文，默认 zh（兼容历史数据）
-- sub_source: 数据子来源，如 cls/10jqka/sina/futu/general/company，默认空字符串

ALTER TABLE news_raw_data ADD COLUMN language TEXT DEFAULT 'zh';
ALTER TABLE news_raw_data ADD COLUMN sub_source TEXT DEFAULT '';
