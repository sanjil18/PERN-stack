const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const dbConfig = {
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || process.env.PGPASSWORD,
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'prntodo'
};

if (typeof dbConfig.password !== 'string' || dbConfig.password.length === 0) {
    throw new Error('Missing PG_PASSWORD. Create server/.env with PG_PASSWORD=your_postgres_password or set the environment variable before starting the server.');
}

const pool = new Pool(dbConfig);

module.exports = pool;