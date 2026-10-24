import { neon } from "@neondatabase/serverless";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  try {
    console.log("Migrating database to restore voters table...");

    // Create voters table
    await sql`
      CREATE TABLE IF NOT EXISTS voters (
        id SERIAL PRIMARY KEY,
        user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    console.log("Created voters table.");

    // Migrate data from users back to voters
    await sql`
      INSERT INTO voters (user_id, candidate_id)
      SELECT id, candidate_id
      FROM users
      WHERE candidate_id IS NOT NULL
      ON CONFLICT (user_id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id;
    `;
    console.log("Migrated votes from users to voters table.");

    // Drop candidate_id from users
    await sql`
      ALTER TABLE users DROP COLUMN IF EXISTS candidate_id;
    `;
    console.log("Dropped candidate_id from users table.");

    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

main();
