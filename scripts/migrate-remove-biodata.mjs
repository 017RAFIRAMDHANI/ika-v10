import { neon } from "@neondatabase/serverless";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  try {
    console.log("Migrating database to remove voters table and biodata...");

    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL;
    `;
    console.log("Added candidate_id to users table.");

    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'voters'
      );
    `;

    if (tableExists[0].exists) {
      await sql`
        UPDATE users u
        SET candidate_id = v.candidate_id
        FROM voters v
        WHERE u.voter_id = v.id AND v.candidate_id IS NOT NULL;
      `;
      console.log("Migrated existing votes from voters to users.");

      await sql`
        ALTER TABLE users DROP COLUMN IF EXISTS voter_id;
      `;
      console.log("Dropped voter_id from users table.");

      await sql`
        DROP TABLE IF EXISTS voters CASCADE;
      `;
      console.log("Dropped voters table.");
    } else {
      console.log("voters table does not exist, skipping drop.");
      await sql`
        ALTER TABLE users DROP COLUMN IF EXISTS voter_id;
      `;
    }

    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

main();
