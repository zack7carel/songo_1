// =====================================================
// SONGO — Serveur Node.js + Express + PostgreSQL
// Remplace tous les fichiers PHP
// =====================================================

const express        = require('express');
const session        = require('express-session');
const pgSession      = require('connect-pg-simple')(session);
const bcrypt         = require('bcryptjs');
const cors           = require('cors');
const { Pool }       = require('pg');
const path           = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONNEXION BASE DE DONNÉES (PostgreSQL)
// Sur Render, DATABASE_URL est fourni automatiquement
// =====================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// =====================================================
// CRÉATION DES TABLES AU DÉMARRAGE
// =====================================================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      pseudo     VARCHAR(50)  NOT NULL UNIQUE,
      email      VARCHAR(150) NOT NULL UNIQUE,
      password   VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      result     VARCHAR(50)  NOT NULL,
      winner     SMALLINT     NULL,
      score_j1   SMALLINT     NOT NULL DEFAULT 0,
      score_j2   SMALLINT     NOT NULL DEFAULT 0,
      board_end  JSONB        NOT NULL,
      reason     VARCHAR(100) NOT NULL DEFAULT '',
      is_draw    BOOLEAN      NOT NULL DEFAULT FALSE,
      played_at  TIMESTAMP    DEFAULT NOW()
    )
  `);

  // Table pour stocker les sessions en base de données
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"    VARCHAR      NOT NULL COLLATE "default",
      "sess"   JSON         NOT NULL,
      "expire" TIMESTAMP(6) NOT NULL,
      PRIMARY KEY ("sid")
    )
  `);

  console.log('✅ Base de données initialisée');
}

// =====================================================
// MIDDLEWARES
// =====================================================
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessions stockées en PostgreSQL (persistent entre redémarrages)
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false
  }),
  secret: process.env.SESSION_SECRET || 'songo_secret_key_changez_moi',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 jours
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production'
  }
}));

// Middleware pour vérifier l'authentification
function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: 'Non authentifié.' });
  }
  next();
}

// =====================================================
// ROUTES AUTH
// =====================================================

// Vérifier la session courante
app.get('/api/check_session', (req, res) => {
  if (req.session?.userId) {
    res.json({
      success:    true,
      logged_in:  true,
      user_id:    req.session.userId,
      pseudo:     req.session.pseudo
    });
  } else {
    res.json({ success: true, logged_in: false });
  }
});

// Inscription
app.post('/api/register', async (req, res) => {
  const { pseudo, email, password } = req.body;

  if (!pseudo || pseudo.trim().length < 2)
    return res.status(400).json({ success: false, error: 'Le pseudo doit contenir au moins 2 caractères.' });
  if (!email || !email.includes('@'))
    return res.status(400).json({ success: false, error: 'Email invalide.' });
  if (!password || password.length < 8)
    return res.status(400).json({ success: false, error: 'Le mot de passe doit contenir au moins 8 caractères.' });

  try {
    // Vérifier si email ou pseudo déjà utilisé
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR pseudo = $2',
      [email.trim(), pseudo.trim()]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const emailUsed = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim()]);
      if (emailUsed.rows.length > 0)
        return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé.' });
      return res.status(400).json({ success: false, error: 'Ce pseudo est déjà pris.' });
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      'INSERT INTO users (pseudo, email, password) VALUES ($1, $2, $3)',
      [pseudo.trim(), email.trim(), hash]
    );

    res.json({ success: true, message: 'Compte créé avec succès.' });
  } catch (err) {
    console.error('Erreur register:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// Connexion
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ success: false, error: 'Email et mot de passe requis.' });

  try {
    const result = await pool.query(
      'SELECT id, pseudo, password FROM users WHERE email = $1',
      [email.trim()]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect.' });

    req.session.userId = user.id;
    req.session.pseudo = user.pseudo;

    res.json({ success: true, user_id: user.id, pseudo: user.pseudo });
  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// Déconnexion
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Déconnecté.' });
  });
});

// =====================================================
// ROUTES HISTORIQUE
// =====================================================

// Sauvegarder une partie
app.post('/api/save_game', requireAuth, async (req, res) => {
  const { result, winner, score_j1, score_j2, board, reason, is_draw } = req.body;

  if (!result)
    return res.status(400).json({ success: false, error: 'Résultat manquant.' });

  try {
    await pool.query(
      `INSERT INTO games (user_id, result, winner, score_j1, score_j2, board_end, reason, is_draw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.session.userId,
        result,
        winner ?? null,
        score_j1 ?? 0,
        score_j2 ?? 0,
        JSON.stringify(board ?? []),
        reason ?? '',
        is_draw ?? false
      ]
    );
    res.json({ success: true, message: 'Partie sauvegardée.' });
  } catch (err) {
    console.error('Erreur save_game:', err);
    res.status(500).json({ success: false, error: 'Erreur lors de la sauvegarde.' });
  }
});

// Récupérer l'historique
app.get('/api/get_history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, result, winner, score_j1, score_j2, board_end, reason, is_draw, played_at
       FROM games
       WHERE user_id = $1
       ORDER BY played_at DESC
       LIMIT 50`,
      [req.session.userId]
    );

    const games = result.rows.map(g => ({
      id:       g.id,
      result:   g.result,
      winner:   g.winner,
      score_j1: g.score_j1,
      score_j2: g.score_j2,
      board:    g.board_end,
      reason:   g.reason,
      is_draw:  g.is_draw,
      played_at: g.played_at
    }));

    const stats = {
      played:  games.length,
      wins:    games.filter(g => g.winner === 1).length,
      losses:  games.filter(g => g.winner === 2).length,
      draws:   games.filter(g => g.is_draw).length,
    };

    res.json({ success: true, games, stats });
  } catch (err) {
    console.error('Erreur get_history:', err);
    res.status(500).json({ success: false, error: 'Erreur lors du chargement.' });
  }
});

// Effacer l'historique
app.post('/api/clear_history', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM games WHERE user_id = $1', [req.session.userId]);
    res.json({ success: true, message: 'Historique effacé.' });
  } catch (err) {
    console.error('Erreur clear_history:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// =====================================================
// ROUTE CATCH-ALL — renvoie index.html pour toute URL inconnue
// =====================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =====================================================
// DÉMARRAGE
// =====================================================
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🎮 Songo serveur démarré sur http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Erreur initialisation DB:', err);
  process.exit(1);
});
