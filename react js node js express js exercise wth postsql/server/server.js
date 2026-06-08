const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'pern-stack-secret';

app.disable('x-powered-by');
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const createToken = (user) =>
    jwt.sign(
        { userId: user.user_id, role: user.role, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

const sanitizeUser = (user) => ({
    id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Missing authentication token' });
    }

    try {
        req.auth = jwt.verify(token, JWT_SECRET);
        return next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
};

const loadCurrentUser = async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT user_id, name, email, role, password_hash, created_at, updated_at FROM users WHERE user_id = $1',
            [req.auth.userId]
        );

        if (!result.rows[0]) {
            return res.status(401).json({ error: 'Account no longer exists' });
        }

        req.currentUser = result.rows[0];
        return next();
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Failed to load current user' });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.currentUser.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    return next();
};

const canAccessUser = (req, targetUserId) =>
    req.currentUser.role === 'admin' || req.currentUser.user_id === Number(targetUserId);

const ensureSchema = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            user_id SERIAL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS todo (
            todo_id SERIAL PRIMARY KEY,
            user_id INTEGER,
            description VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`ALTER TABLE todo ADD COLUMN IF NOT EXISTS user_id INTEGER`);
    await pool.query(`ALTER TABLE todo ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE todo ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE todo ALTER COLUMN created_at SET DEFAULT NOW()`);
    await pool.query(`ALTER TABLE todo ALTER COLUMN updated_at SET DEFAULT NOW()`);

    await pool.query(`
        DO $$
        BEGIN
            ALTER TABLE todo
            ADD CONSTRAINT todo_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$
    `);
};

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

app.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const existingUser = await pool.query('SELECT user_id FROM users WHERE email = $1', [normalizedEmail]);

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Email is already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, role)
             VALUES ($1, $2, $3, $4)
             RETURNING user_id, name, email, role, created_at, updated_at`,
            [String(name).trim(), normalizedEmail, passwordHash, 'user']
        );

        const user = result.rows[0];
        return res.status(201).json({ token: createToken(user), user: sanitizeUser(user) });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Failed to register user' });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const result = await pool.query(
            'SELECT user_id, name, email, role, password_hash, created_at, updated_at FROM users WHERE email = $1',
            [normalizedEmail]
        );

        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        return res.json({ token: createToken(user), user: sanitizeUser(user) });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Failed to log in' });
    }
});

app.get('/auth/me', authenticateToken, loadCurrentUser, async (req, res) => {
    res.json({ user: sanitizeUser(req.currentUser) });
});

app.get('/users', authenticateToken, loadCurrentUser, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.user_id, u.name, u.email, u.role, u.created_at, u.updated_at,
                            COUNT(t.todo_id)::int AS todo_count
             FROM users u
             LEFT JOIN todo t ON t.user_id = u.user_id
             GROUP BY u.user_id
             ORDER BY u.created_at DESC`
        );

        res.json(result.rows.map((user) => ({
            id: user.user_id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            todoCount: user.todo_count,
        })));
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.get('/users/:id', authenticateToken, loadCurrentUser, async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (!canAccessUser(req, userId)) {
            return res.status(403).json({ error: 'You can only access your own account' });
        }

        const userResult = await pool.query(
            'SELECT user_id, name, email, role, created_at, updated_at FROM users WHERE user_id = $1',
            [userId]
        );
        const user = userResult.rows[0];

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const todosResult = await pool.query(
            `SELECT todo_id AS id, description, user_id AS "userId", created_at AS "createdAt", updated_at AS "updatedAt"
             FROM todo
             WHERE user_id = $1
             ORDER BY todo_id DESC`,
            [userId]
        );

        res.json({
            user: {
                id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.created_at,
                updatedAt: user.updated_at,
            },
            todos: todosResult.rows,
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

app.put('/users/:id', authenticateToken, loadCurrentUser, async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (!canAccessUser(req, userId)) {
            return res.status(403).json({ error: 'You can only update your own account' });
        }

        const { name, email, password, role } = req.body;
        const accountResult = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);

        if (!accountResult.rows[0]) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updates = [];
        const values = [];

        if (typeof name === 'string' && name.trim()) {
            values.push(name.trim());
            updates.push(`name = $${values.length}`);
        }

        if (typeof email === 'string' && email.trim()) {
            const normalizedEmail = email.trim().toLowerCase();
            const emailCheck = await pool.query('SELECT user_id FROM users WHERE email = $1 AND user_id <> $2', [normalizedEmail, userId]);

            if (emailCheck.rows.length > 0) {
                return res.status(409).json({ error: 'Email is already in use' });
            }

            values.push(normalizedEmail);
            updates.push(`email = $${values.length}`);
        }

        if (typeof password === 'string' && password.trim()) {
            const passwordHash = await bcrypt.hash(password, 10);
            values.push(passwordHash);
            updates.push(`password_hash = $${values.length}`);
        }

        if (req.currentUser.role === 'admin' && typeof role === 'string' && ['user', 'admin'].includes(role)) {
            values.push(role);
            updates.push(`role = $${values.length}`);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields were provided' });
        }

        values.push(userId);
        const result = await pool.query(
            `UPDATE users
             SET ${updates.join(', ')}, updated_at = NOW()
             WHERE user_id = $${values.length}
             RETURNING user_id, name, email, role, created_at, updated_at`,
            values
        );

        res.json({ user: sanitizeUser(result.rows[0]) });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to update account' });
    }
});

app.delete('/users/:id', authenticateToken, loadCurrentUser, async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (!canAccessUser(req, userId)) {
            return res.status(403).json({ error: 'You can only delete your own account' });
        }

        await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
        res.json({ message: 'Account deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

app.post('/users/:id/todos', authenticateToken, loadCurrentUser, async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);

        if (!canAccessUser(req, targetUserId)) {
            return res.status(403).json({ error: 'You can only add todos for your own account' });
        }

        const { description } = req.body;
        if (!description?.trim()) {
            return res.status(400).json({ error: 'Todo description is required' });
        }

        const result = await pool.query(
            `INSERT INTO todo (user_id, description)
             VALUES ($1, $2)
             RETURNING todo_id AS id, description, user_id AS "userId", created_at AS "createdAt", updated_at AS "updatedAt"`,
            [targetUserId, description.trim()]
        );

        res.status(201).json({ todo: result.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to create todo' });
    }
});

app.put('/todos/:id', authenticateToken, loadCurrentUser, async (req, res) => {
    try {
        const todoId = Number(req.params.id);
        const { description } = req.body;

        const existing = await pool.query('SELECT todo_id, user_id FROM todo WHERE todo_id = $1', [todoId]);
        const todo = existing.rows[0];

        if (!todo) {
            return res.status(404).json({ error: 'Todo not found' });
        }

        if (!canAccessUser(req, todo.user_id)) {
            return res.status(403).json({ error: 'You can only edit your own todos' });
        }

        if (!description?.trim()) {
            return res.status(400).json({ error: 'Todo description is required' });
        }

        const result = await pool.query(
            `UPDATE todo
             SET description = $1, updated_at = NOW()
             WHERE todo_id = $2
             RETURNING todo_id AS id, description, user_id AS "userId", created_at AS "createdAt", updated_at AS "updatedAt"`,
            [description.trim(), todoId]
        );

        res.json({ todo: result.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to update todo' });
    }
});

app.delete('/todos/:id', authenticateToken, loadCurrentUser, async (req, res) => {
    try {
        const todoId = Number(req.params.id);
        const existing = await pool.query('SELECT todo_id, user_id FROM todo WHERE todo_id = $1', [todoId]);
        const todo = existing.rows[0];

        if (!todo) {
            return res.status(404).json({ error: 'Todo not found' });
        }

        if (!canAccessUser(req, todo.user_id)) {
            return res.status(403).json({ error: 'You can only delete your own todos' });
        }

        await pool.query('DELETE FROM todo WHERE todo_id = $1', [todoId]);
        res.json({ message: 'Todo was deleted!' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to delete todo' });
    }
});

const startServer = async () => {
    try {
        await ensureSchema();
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start server', err.message);
        process.exit(1);
    }
};

startServer();