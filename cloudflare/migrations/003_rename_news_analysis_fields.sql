-- `001_init.sql` now creates `daily_news_ai_analysis` with the renamed fields directly.
-- This migration remains as a compatibility marker for older remote databases
-- that were migrated before the baseline schema was updated.
SELECT 1;
