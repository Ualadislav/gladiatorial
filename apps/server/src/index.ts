import { createHmac, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { Pool, type PoolClient } from 'pg';

type StatName = 'strength' | 'vitality' | 'weapon';
type SkinName = 'bronze' | 'ember' | 'azure';
type TelegramUser = { id: string; first_name?: string; username?: string };
type ProfileRow = {
  user_id: string;
  username: string;
  level: number;
  xp: number;
  gold: number;
  strength: number;
  vitality: number;
  weapon: number;
  skin: SkinName;
  unlocked_skins: SkinName[];
};

const isProduction = process.env.NODE_ENV === 'production';
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const allowDevAuth = !isProduction && process.env.ALLOW_DEV_AUTH === 'true';
if (isProduction && !botToken) {
  throw new Error('TELEGRAM_BOT_TOKEN is required in production.');
}
if (!botToken && !allowDevAuth) {
  throw new Error('Set TELEGRAM_BOT_TOKEN or ALLOW_DEV_AUTH=true for local development.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});
const app = Fastify({ logger: true, trustProxy: true });

await app.register(cors, {
  origin: process.env.WEB_ORIGIN?.split(',').map((origin) => origin.trim()) ?? 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['authorization', 'content-type'],
});

async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0 AND xp < 100),
      gold INTEGER NOT NULL DEFAULT 120 CHECK (gold >= 0),
      strength INTEGER NOT NULL DEFAULT 10 CHECK (strength BETWEEN 1 AND 100),
      vitality INTEGER NOT NULL DEFAULT 100 CHECK (vitality BETWEEN 1 AND 170),
      weapon INTEGER NOT NULL DEFAULT 1 CHECK (weapon BETWEEN 1 AND 100),
      skin TEXT NOT NULL DEFAULT 'bronze' CHECK (skin IN ('bronze', 'ember', 'azure')),
      unlocked_skins JSONB NOT NULL DEFAULT '["bronze"]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function profileFromRow(row: ProfileRow) {
  return {
    username: row.username,
    level: row.level,
    xp: row.xp,
    gold: row.gold,
    strength: row.strength,
    vitality: row.vitality,
    weapon: row.weapon,
    skin: row.skin,
    unlockedSkins: row.unlocked_skins,
  };
}

function validateTelegramInitData(initData: string): TelegramUser {
  if (!botToken) throw new Error('Telegram authentication is not configured.');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const userText = params.get('user');
  if (!hash || !userText || !Number.isInteger(authDate)) {
    throw new Error('Telegram authorization data is incomplete.');
  }
  if (Math.abs(Date.now() / 1000 - authDate) > 86_400) {
    throw new Error('Telegram authorization data has expired. Reopen the app.');
  }
  params.delete('hash');
  params.delete('signature');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const suppliedHash = Buffer.from(hash, 'hex');
  if (suppliedHash.length !== expectedHash.length || !timingSafeEqual(suppliedHash, expectedHash)) {
    throw new Error('Telegram authorization data is invalid.');
  }
  const user = JSON.parse(userText) as Partial<TelegramUser>;
  if (!user.id || !/^\d+$/.test(user.id)) throw new Error('Telegram user ID is invalid.');
  return {
    id: user.id,
    first_name: user.first_name,
    username: user.username,
  };
}

function authenticate(request: FastifyRequest, reply: FastifyReply): TelegramUser | null {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('tma ') && botToken) {
    try {
      return validateTelegramInitData(authorization.slice(4));
    } catch (error) {
      void reply.code(401).send({ error: error instanceof Error ? error.message : 'Telegram authorization failed.' });
      return null;
    }
  }
  if (allowDevAuth) {
    return { id: 'local-dev', first_name: 'Тестовый боец', username: 'dev' };
  }
  void reply.code(401).send({ error: 'Open the game through its Telegram bot to sign in.' });
  return null;
}

async function findOrCreateProfile(user: TelegramUser): Promise<ProfileRow> {
  const username = (user.username || user.first_name || 'Гладиатор').slice(0, 40);
  const result = await pool.query<ProfileRow>(
    `INSERT INTO profiles (user_id, username) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, updated_at = NOW()
     RETURNING user_id, username, level, xp, gold, strength, vitality, weapon, skin, unlocked_skins`,
    [user.id, username],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Could not create player profile.');
  return row;
}

app.get('/api/health', async (_request, reply) => {
  await pool.query('SELECT 1');
  return reply.send({ status: 'ok' });
});

app.get('/api/profile', async (request, reply) => {
  const user = authenticate(request, reply);
  if (!user) return;
  const profile = await findOrCreateProfile(user);
  return reply.send(profileFromRow(profile));
});

app.post<{ Body: { stat?: string } }>('/api/progression/upgrade', async (request, reply) => {
  const user = authenticate(request, reply);
  if (!user) return;
  const stat = request.body?.stat;
  if (stat !== 'strength' && stat !== 'vitality' && stat !== 'weapon') {
    return reply.code(400).send({ error: 'Unknown gladiator stat.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profile = await findOrCreateProfileWithClient(client, user);
    const current = profile[stat];
    const base = stat === 'vitality' ? 100 : stat === 'strength' ? 10 : 1;
    const maximum = stat === 'vitality' ? 170 : 100;
    if (current >= maximum) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: 'Эта характеристика уже достигла максимума.' });
    }
    const price = 30 + (current - base) * 12;
    if (profile.gold < price) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: 'Не хватает золота для улучшения.' });
    }
    const increment = stat === 'vitality' ? 10 : 1;
    const result = await client.query<ProfileRow>(
      `UPDATE profiles SET ${stat} = LEAST(${stat} + $2, $3),
       gold = gold - $4, updated_at = NOW()
       WHERE user_id = $1
       RETURNING user_id, username, level, xp, gold, strength, vitality, weapon, skin, unlocked_skins`,
      [user.id, increment, maximum, price],
    );
    await client.query('COMMIT');
    return reply.send(profileFromRow(result.rows[0]!));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.post<{ Body: { skin?: string } }>('/api/cosmetics/buy', async (request, reply) => {
  const user = authenticate(request, reply);
  if (!user) return;
  const skin = request.body?.skin;
  if (skin !== 'ember' && skin !== 'azure') {
    return reply.code(400).send({ error: 'Unknown gladiator appearance.' });
  }
  const cost = skin === 'ember' ? 80 : 110;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profile = await findOrCreateProfileWithClient(client, user);
    if (profile.unlocked_skins.includes(skin)) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: 'Этот облик уже открыт.' });
    }
    if (profile.gold < cost) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: 'Не хватает золота для этого образа.' });
    }
    const result = await client.query<ProfileRow>(
      `UPDATE profiles SET gold = gold - $2, unlocked_skins = unlocked_skins || $3::jsonb,
       skin = $4, updated_at = NOW()
       WHERE user_id = $1
       RETURNING user_id, username, level, xp, gold, strength, vitality, weapon, skin, unlocked_skins`,
      [user.id, cost, JSON.stringify([skin]), skin],
    );
    await client.query('COMMIT');
    return reply.send(profileFromRow(result.rows[0]!));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.post<{ Body: { skin?: string } }>('/api/cosmetics/equip', async (request, reply) => {
  const user = authenticate(request, reply);
  if (!user) return;
  const skin = request.body?.skin;
  if (skin !== 'bronze' && skin !== 'ember' && skin !== 'azure') {
    return reply.code(400).send({ error: 'Unknown gladiator appearance.' });
  }
  const profile = await findOrCreateProfile(user);
  if (!profile.unlocked_skins.includes(skin)) {
    return reply.code(403).send({ error: 'Этот облик ещё не открыт.' });
  }
  const result = await pool.query<ProfileRow>(
    `UPDATE profiles SET skin = $2, updated_at = NOW()
     WHERE user_id = $1
     RETURNING user_id, username, level, xp, gold, strength, vitality, weapon, skin, unlocked_skins`,
    [user.id, skin],
  );
  return reply.send(profileFromRow(result.rows[0]!));
});

async function findOrCreateProfileWithClient(
  client: PoolClient,
  user: TelegramUser,
): Promise<ProfileRow> {
  const username = (user.username || user.first_name || 'Гладиатор').slice(0, 40);
  const result = await client.query<ProfileRow>(
    `INSERT INTO profiles (user_id, username) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username
     RETURNING user_id, username, level, xp, gold, strength, vitality, weapon, skin, unlocked_skins`,
    [user.id, username],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Could not create player profile.');
  return row;
}

app.addHook('onClose', async () => {
  await pool.end();
});

const port = Number(process.env.PORT ?? 3000);
await initializeDatabase();
await app.listen({ port, host: '0.0.0.0' });
