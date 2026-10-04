import { neon } from "@neondatabase/serverless";

const LEAGUE_ID = "a96ae9f9-cd1a-4079-af67-1a8edc3ce331";
const OLD_CODE = "pitch-ember-7421";
const NEW_CODE = "mindell";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.NEON_DATABASE_URL;

if (!connectionString) {
  console.error("No Neon/Postgres production connection string is available after Vercel env pull.");
  process.exit(1);
}

const sql = neon(connectionString);

const conflicts = await sql`
  select id
  from api.leagues
  where join_code = ${NEW_CODE}
    and id <> ${LEAGUE_ID}::uuid
  limit 1
`;

if (conflicts.length) {
  console.error("League code 'mindell' is already in use by another league.");
  process.exit(1);
}

const current = await sql`
  select join_code
  from api.leagues
  where id = ${LEAGUE_ID}::uuid
`;

if (!current.length) {
  console.error("SoccerTime league was not found.");
  process.exit(1);
}

if (current[0].join_code === NEW_CODE) {
  console.log("SoccerTime league code is already 'mindell'.");
  process.exit(0);
}

if (current[0].join_code !== OLD_CODE) {
  console.error("SoccerTime league code is neither the expected legacy code nor 'mindell'; refusing to overwrite it.");
  process.exit(1);
}

const updated = await sql`
  update api.leagues
  set join_code = ${NEW_CODE}
  where id = ${LEAGUE_ID}::uuid
    and join_code = ${OLD_CODE}
  returning join_code
`;

if (updated.length !== 1 || updated[0].join_code !== NEW_CODE) {
  console.error("League code migration did not update exactly one SoccerTime league.");
  process.exit(1);
}

console.log("SoccerTime league code changed to 'mindell'.");
