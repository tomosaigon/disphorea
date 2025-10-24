import db from './client';

db.exec(`
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  pseudo_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  signal TEXT NOT NULL,
  content TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_board_created ON posts(board_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_pseudo ON posts(pseudo_id);
`);

console.log('Migration complete.');
