const { Pool } = require("pg");

const pool = new Pool({
    user: "postgres",
    password: "Sanjil@2021", // Double check that this is your actual PostgreSQL password!
    host: "localhost",
    port: 5432,
    database: "prntodo"
});

module.exports = pool;