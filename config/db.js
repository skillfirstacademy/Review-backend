import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(isProduction
        ? { ssl: { rejectUnauthorized: false } }
        : {} // no SSL locally
    ),
});

pool.connect()
    .then(() => console.log("✅ PostgreSQL Connected"))
    .catch(err => console.error("❌ DB Connection Error:", err));

export default pool;

