import { neon } from "@neondatabase/serverless";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  try {
    console.log("Migrating roles...");

    // Drop constraint before updating roles
    await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`;
    
    // Update Super Administrator to Admin
    await sql`UPDATE users SET role = 'Admin' WHERE role = 'Super Administrator';`;
    console.log("Updated Super Administrators to Admin.");

    // Update Mahasiswa to Alumni
    await sql`UPDATE users SET role = 'Alumni' WHERE role = 'Mahasiswa';`;
    console.log("Updated Mahasiswa to Alumni.");

    // Update constraints and defaults

    
    await sql`
      ALTER TABLE users 
      ADD CONSTRAINT users_role_check CHECK (role IN ('Alumni', 'Admin'));
    `;
    console.log("Updated CHECK constraint.");

    await sql`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'Alumni';`;
    console.log("Updated DEFAULT value to Alumni.");

    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

main();
