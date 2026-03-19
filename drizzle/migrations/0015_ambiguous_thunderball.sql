-- Snapshot sync migration kept intentionally as a no-op so Drizzle metadata
-- stays aligned after the join-gate schema landed in 0014.
SET @drizzle_join_gate_snapshot_sync = 1;
