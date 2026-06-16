const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'pern-stack-secret';
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const FACEBOOK_CLIENT_ID = process.env.FACEBOOK_CLIENT_ID || '';
const FACEBOOK_CLIENT_SECRET = process.env.FACEBOOK_CLIENT_SECRET || '';

const oauthCookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
};

// --- Uploads directory setup ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `avatar_${req.params.id}_${Date.now()}${ext}`);
    },
});

const upload = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WEBP)'));
        }
    },
});

app.disable('x-powered-by');
app.use(cors({
    origin: CLIENT_URL,
    credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

// --- Helpers ---
const buildClientUrl = (query = {}) => {
    const url = new URL('/', CLIENT_URL);
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, value);
        }
    });
    return url.toString();
};

const redirectToClient = (res, query = {}) => res.redirect(buildClientUrl(query));

const createOAuthState = () => crypto.randomBytes(24).toString('hex');
const getOAuthStateCookieName = (provider) => `oauth_state_${provider}`;

const setOAuthStateCookie = (res, provider, state) =>
    res.cookie(getOAuthStateCookieName(provider), state, oauthCookieOptions);

const verifyOAuthState = (req, res, provider) => {
    const cookieName = getOAuthStateCookieName(provider);
    const cookieState = req.cookies[cookieName];
    const queryState = req.query.state;
    res.clearCookie(cookieName, { path: '/' });
    if (!cookieState || !queryState || cookieState !== queryState) return false;
    return true;
};

const sendOAuthError = (res, message) => redirectToClient(res, { auth_error: message });

const fetchJson = async (url, options) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error_description || payload.error || 'OAuth request failed');
    }
    return payload;
};

const exchangeGoogleCode = async (code) =>
    fetchJson('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: `${SERVER_URL}/auth/google/callback`,
            grant_type: 'authorization_code',
        }),
    });

const fetchGoogleProfile = async (accessToken) =>
    fetchJson('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

const exchangeFacebookCode = async (code) =>
    fetchJson(`https://graph.facebook.com/v18.0/oauth/access_token?${new URLSearchParams({
        code,
        client_id: FACEBOOK_CLIENT_ID,
        client_secret: FACEBOOK_CLIENT_SECRET,
        redirect_uri: `${SERVER_URL}/auth/facebook/callback`,
    })}`);

const fetchFacebookProfile = async (accessToken) =>
    fetchJson(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`);

const sanitizeUser = (user) => ({
    id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    provider: user.provider || null,
    avatarUrl: user.avatar_url || null,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
});

const syncOAuthUser = async ({ provider, providerId, email, name, avatarUrl }) => {
    const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
    if (!normalizedEmail) throw new Error('Email access is required for social login');

    const providerLookup = await pool.query(
        'SELECT user_id, name, email, role, avatar_url, provider, provider_id, created_at, updated_at FROM users WHERE provider = $1 AND provider_id = $2',
        [provider, providerId]
    );

    const emailLookup = providerLookup.rows[0]
        ? null
        : await pool.query(
            'SELECT user_id, name, email, role, avatar_url, provider, provider_id, created_at, updated_at FROM users WHERE email = $1',
            [normalizedEmail]
        );

    const existingUser = providerLookup.rows[0] || emailLookup?.rows[0] || null;

    if (existingUser) {
        const result = await pool.query(
            `UPDATE users
             SET name = COALESCE(NULLIF($1, ''), name),
                 email = $2,
                 provider = $3,
                 provider_id = $4,
                 avatar_url = COALESCE($5, avatar_url),
                 updated_at = NOW()
             WHERE user_id = $6
             RETURNING user_id, name, email, role, avatar_url, provider, provider_id, created_at, updated_at`,
            [String(name || '').trim(), normalizedEmail, provider, providerId, avatarUrl || null, existingUser.user_id]
        );
        return result.rows[0];
    }

    const result = await pool.query(
        `INSERT INTO users (name, email, password_hash, provider, provider_id, avatar_url, role)
         VALUES ($1, $2, NULL, $3, $4, $5, 'user')
         RETURNING user_id, name, email, role, avatar_url, provider, provider_id, created_at, updated_at`,
        [String(name || normalizedEmail).trim(), normalizedEmail, provider, providerId, avatarUrl || null]
    );
    return result.rows[0];
};

const createToken = (user) =>
    jwt.sign(
        { userId: user.user_id, role: user.role, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

const handleOAuthCallback = (provider) => async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) return sendOAuthError(res, `${provider}_missing_code`);
        if (!verifyOAuthState(req, res, provider)) return sendOAuthError(res, `${provider}_invalid_state`);

        if (provider === 'google') {
            if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return sendOAuthError(res, 'google_not_configured');
            const tokenData = await exchangeGoogleCode(code);
            const profile = await fetchGoogleProfile(tokenData.access_token);
            const user = await syncOAuthUser({
                provider: 'google',
                providerId: profile.sub,
                email: profile.email,
                name: profile.name,
                avatarUrl: profile.picture,
            });
            return redirectToClient(res, { token: createToken(user) });
        }

        if (provider === 'facebook') {
            if (!FACEBOOK_CLIENT_ID || !FACEBOOK_CLIENT_SECRET) return sendOAuthError(res, 'facebook_not_configured');
            const tokenData = await exchangeFacebookCode(code);
            const profile = await fetchFacebookProfile(tokenData.access_token);
            const user = await syncOAuthUser({
                provider: 'facebook',
                providerId: profile.id,
                email: profile.email,
                name: profile.name,
                avatarUrl: profile.picture?.data?.url || null,
            });
            return redirectToClient(res, { token: createToken(user) });
        }

        return sendOAuthError(res, 'unknown_provider');
    } catch (err) {
        console.error(`[OAuth:${provider}]`, err.message);
        return sendOAuthError(res, 'social_login_failed');
    }
};

// --- Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing authentication token' });
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
            'SELECT user_id, name, email, role, password_hash, provider, provider_id, avatar_url, created_at, updated_at FROM users WHERE user_id = $1',
            [req.auth.userId]
        );
        if (!result.rows[0]) return res.status(401).json({ error: 'Account no longer exists' });
        req.currentUser = result.rows[0];
        return next();
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Failed to load current user' });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.currentUser.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    return next();
};

const canAccessUser = (req, targetUserId) =>
    req.currentUser.role === 'admin' || req.currentUser.user_id === Number(targetUserId);

// --- Schema ---
const ensureSchema = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            user_id SERIAL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash TEXT,
            provider VARCHAR(32),
            provider_id TEXT,
            avatar_url TEXT,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(32)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_provider_provider_id_idx ON users (provider, provider_id)`);

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
    await pool.query(`ALTER TABLE todo ALTER COLUMN created_at SET DEFAULT NOW()`).catch(() => {});
    await pool.query(`ALTER TABLE todo ALTER COLUMN updated_at SET DEFAULT NOW()`).catch(() => {});
    await pool.query(`
        DO $$
        BEGIN
            ALTER TABLE todo ADD CONSTRAINT todo_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    `);
};

// --- Routes ---
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/auth/providers', (_req, res) => {
    res.json({
        googleConfigured: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
        facebookConfigured: Boolean(FACEBOOK_CLIENT_ID && FACEBOOK_CLIENT_SECRET),
    });
});

app.get('/auth/google', (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return sendOAuthError(res, 'google_not_configured');
    const state = createOAuthState();
    setOAuthStateCookie(res, 'google', state);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${SERVER_URL}/auth/google/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
    return res.redirect(url.toString());
});

app.get('/auth/google/callback', handleOAuthCallback('google'));

app.get('/auth/facebook', (req, res) => {
    if (!FACEBOOK_CLIENT_ID || !FACEBOOK_CLIENT_SECRET) return sendOAuthError(res, 'facebook_not_configured');
    const state = createOAuthState();
    setOAuthStateCookie(res, 'facebook', state);
    const url = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    url.searchParams.set('client_id', FACEBOOK_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${SERVER_URL}/auth/facebook/callback`);
    url.searchParams.set('scope', 'email,public_profile');
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    return res.redirect(url.toString());
});

app.get('/auth/facebook/callback', handleOAuthCallback('facebook'));

app.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }
        const normalizedEmail = String(email).trim().toLowerCase();
        const existing = await pool.query('SELECT user_id FROM users WHERE email = $1', [normalizedEmail]);
        if (existing.rows.length > 0) return res.status(409).json({ error: 'Email is already registered' });

        const passwordHash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, role)
             VALUES ($1, $2, $3, 'user')
             RETURNING user_id, name, email, role, avatar_url, provider, created_at, updated_at`,
            [String(name).trim(), normalizedEmail, passwordHash]
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
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

        const normalizedEmail = String(email).trim().toLowerCase();
        const result = await pool.query(
            'SELECT user_id, name, email, role, password_hash, provider, provider_id, avatar_url, created_at, updated_at FROM users WHERE email = $1',
            [normalizedEmail]
        );
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });

        if (!user.password_hash) {
            const providerName = user.provider
                ? user.provider.charAt(0).toUpperCase() + user.provider.slice(1)
                : 'a social provider';
            return res.status(400).json({ error: `This account uses ${providerName} login. Please sign in with ${providerName}.` });
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatches) return res.status(401).json({ error: 'Invalid email or password' });

        return res.json({ token: createToken(user), user: sanitizeUser(user) });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Failed to log in' });
    }
});

app.get('/auth/me', authenticateToken, loadCurrentUser, (req, res) => {
    res.json({ user: sanitizeUser(req.currentUser) });
});

app.get('/users', authenticateToken, loadCurrentUser, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.user_id, u.name, u.email, u.role, u.avatar_url, u.provider, u.created_at, u.updated_at,
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
            provider: user.provider || null,
            avatarUrl: user.avatar_url || null,
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
        if (!canAccessUser(req, userId)) return res.status(403).json({ error: 'You can only access your own account' });

        const userResult = await pool.query(
            'SELECT user_id, name, email, role, avatar_url, provider, created_at, updated_at FROM users WHERE user_id = $1',
            [userId]
        );
        const user = userResult.rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });

        const todosResult = await pool.query(
            `SELECT todo_id AS id, description, user_id AS "userId", created_at AS "createdAt", updated_at AS "updatedAt"
             FROM todo WHERE user_id = $1 ORDER BY todo_id DESC`,
            [userId]
        );

        res.json({
            user: sanitizeUser(user),
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
        if (!canAccessUser(req, userId)) return res.status(403).json({ error: 'You can only update your own account' });

        const { name, email, password, role } = req.body;
        const accountResult = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
        if (!accountResult.rows[0]) return res.status(404).json({ error: 'User not found' });

        const updates = [];
        const values = [];

        if (typeof name === 'string' && name.trim()) {
            values.push(name.trim());
            updates.push(`name = $${values.length}`);
        }

        if (typeof email === 'string' && email.trim()) {
            const normalizedEmail = email.trim().toLowerCase();
            const emailCheck = await pool.query('SELECT user_id FROM users WHERE email = $1 AND user_id <> $2', [normalizedEmail, userId]);
            if (emailCheck.rows.length > 0) return res.status(409).json({ error: 'Email is already in use' });
            values.push(normalizedEmail);
            updates.push(`email = $${values.length}`);
        }

        if (typeof password === 'string' && password.trim()) {
            const passwordHash = await bcrypt.hash(password, 12);
            values.push(passwordHash);
            updates.push(`password_hash = $${values.length}`);
        }

        if (req.currentUser.role === 'admin' && typeof role === 'string' && ['user', 'admin'].includes(role)) {
            values.push(role);
            updates.push(`role = $${values.length}`);
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No valid fields were provided' });

        values.push(userId);
        const result = await pool.query(
            `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
             WHERE user_id = $${values.length}
             RETURNING user_id, name, email, role, avatar_url, provider, created_at, updated_at`,
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
        if (!canAccessUser(req, userId)) return res.status(403).json({ error: 'You can only delete your own account' });

        // Clean up local avatar file
        const old = await pool.query('SELECT avatar_url FROM users WHERE user_id = $1', [userId]);
        const oldUrl = old.rows[0]?.avatar_url;
        if (oldUrl && oldUrl.startsWith('/uploads/')) {
            fs.unlink(path.join(uploadsDir, path.basename(oldUrl)), () => {});
        }

        await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
        res.json({ message: 'Account deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

// Avatar upload
app.post('/users/:id/avatar', authenticateToken, loadCurrentUser, (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large. Maximum size is 5MB.' : err.message });
        }
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        if (!canAccessUser(req, userId)) return res.status(403).json({ error: 'You can only update your own avatar' });
        if (!req.file) return res.status(400).json({ error: 'No image file provided' });

        // Delete old local avatar
        const old = await pool.query('SELECT avatar_url FROM users WHERE user_id = $1', [userId]);
        const oldUrl = old.rows[0]?.avatar_url;
        if (oldUrl && oldUrl.startsWith('/uploads/')) {
            fs.unlink(path.join(uploadsDir, path.basename(oldUrl)), () => {});
        }

        const avatarUrl = `/uploads/${req.file.filename}`;
        const result = await pool.query(
            `UPDATE users SET avatar_url = $1, updated_at = NOW()
             WHERE user_id = $2
             RETURNING user_id, name, email, role, avatar_url, provider, created_at, updated_at`,
            [avatarUrl, userId]
        );
        res.json({ user: sanitizeUser(result.rows[0]) });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

// Avatar remove
app.delete('/users/:id/avatar', authenticateToken, loadCurrentUser, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        if (!canAccessUser(req, userId)) return res.status(403).json({ error: 'You can only remove your own avatar' });

        const old = await pool.query('SELECT avatar_url FROM users WHERE user_id = $1', [userId]);
        const oldUrl = old.rows[0]?.avatar_url;
        if (oldUrl && oldUrl.startsWith('/uploads/')) {
            fs.unlink(path.join(uploadsDir, path.basename(oldUrl)), () => {});
        }

        const result = await pool.query(
            `UPDATE users SET avatar_url = NULL, updated_at = NOW()
             WHERE user_id = $1
             RETURNING user_id, name, email, role, avatar_url, provider, created_at, updated_at`,
            [userId]
        );
        res.json({ user: sanitizeUser(result.rows[0]) });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to remove avatar' });
    }
});

app.post('/users/:id/todos', authenticateToken, loadCurrentUser, async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!canAccessUser(req, targetUserId)) return res.status(403).json({ error: 'You can only add todos for your own account' });

        const { description } = req.body;
        if (!description?.trim()) return res.status(400).json({ error: 'Todo description is required' });

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
        if (!todo) return res.status(404).json({ error: 'Todo not found' });
        if (!canAccessUser(req, todo.user_id)) return res.status(403).json({ error: 'You can only edit your own todos' });
        if (!description?.trim()) return res.status(400).json({ error: 'Todo description is required' });

        const result = await pool.query(
            `UPDATE todo SET description = $1, updated_at = NOW()
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
        if (!todo) return res.status(404).json({ error: 'Todo not found' });
        if (!canAccessUser(req, todo.user_id)) return res.status(403).json({ error: 'You can only delete your own todos' });

        await pool.query('DELETE FROM todo WHERE todo_id = $1', [todoId]);
        res.json({ message: 'Todo deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to delete todo' });
    }
});

const startServer = async () => {
    try {
        await ensureSchema();
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    } catch (err) {
        console.error('Failed to start server:', err.message);
        process.exit(1);
    }
};

startServer();
