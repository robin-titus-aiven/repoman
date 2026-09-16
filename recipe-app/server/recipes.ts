import type { PoolClient } from 'pg';
import { pool } from './db.js';
import { seedRecipes } from './seed.js';
import {
  CATEGORIES,
  DIFFICULTIES,
  type Recipe,
  type RecipeDraft,
} from '../src/recipes.js';

/**
 * Everything lives under a dedicated schema: `pg-test-signals` is a shared
 * database, so the app must not assume `public` is free for its own tables.
 */
const SCHEMA = 'cucina';

const COLUMNS = `
  id, name, category, region, minutes, servings,
  difficulty, description, ingredients, method
`;

const asList = (values: readonly string[]) =>
  values.map((value) => `'${value}'`).join(', ');

/**
 * Creates the schema and table if absent, then seeds the starter recipes on a
 * genuinely empty table. Safe to run on every boot.
 */
export async function initialiseSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.recipes (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL CHECK (category IN (${asList(CATEGORIES)})),
        region      TEXT NOT NULL DEFAULT '',
        minutes     INTEGER NOT NULL CHECK (minutes > 0),
        servings    INTEGER NOT NULL CHECK (servings > 0),
        difficulty  TEXT NOT NULL CHECK (difficulty IN (${asList(DIFFICULTIES)})),
        description TEXT NOT NULL DEFAULT '',
        ingredients TEXT NOT NULL,
        method      TEXT NOT NULL DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${SCHEMA}.recipes`,
    );
    if (rows[0]?.count === '0') {
      await seed(client);
    }
  } finally {
    client.release();
  }
}

async function seed(client: PoolClient): Promise<void> {
  // Seeded in listed order with ascending timestamps so the default
  // newest-first ordering shows them the way the original app did.
  for (const [index, recipe] of seedRecipes.entries()) {
    await client.query(
      `INSERT INTO ${SCHEMA}.recipes (${COLUMNS}, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() - ($11 || ' seconds')::interval)
       ON CONFLICT (id) DO NOTHING`,
      [
        recipe.id,
        recipe.name,
        recipe.category,
        recipe.region,
        recipe.minutes,
        recipe.servings,
        recipe.difficulty,
        recipe.description,
        recipe.ingredients,
        recipe.method,
        String(index),
      ],
    );
  }
}

export async function listRecipes(): Promise<Recipe[]> {
  const { rows } = await pool.query<Recipe>(
    `SELECT ${COLUMNS} FROM ${SCHEMA}.recipes ORDER BY created_at DESC, name ASC`,
  );
  return rows;
}

export async function createRecipe(
  id: string,
  draft: RecipeDraft,
): Promise<Recipe> {
  const { rows } = await pool.query<Recipe>(
    `INSERT INTO ${SCHEMA}.recipes (${COLUMNS})
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${COLUMNS}`,
    [
      id,
      draft.name,
      draft.category,
      draft.region,
      draft.minutes,
      draft.servings,
      draft.difficulty,
      draft.description,
      draft.ingredients,
      draft.method,
    ],
  );
  return rows[0];
}

/** Resolves to null when no row matches, so the caller can answer 404. */
export async function updateRecipe(
  id: string,
  draft: RecipeDraft,
): Promise<Recipe | null> {
  const { rows } = await pool.query<Recipe>(
    `UPDATE ${SCHEMA}.recipes SET
       name = $2, category = $3, region = $4, minutes = $5, servings = $6,
       difficulty = $7, description = $8, ingredients = $9, method = $10,
       updated_at = now()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [
      id,
      draft.name,
      draft.category,
      draft.region,
      draft.minutes,
      draft.servings,
      draft.difficulty,
      draft.description,
      draft.ingredients,
      draft.method,
    ],
  );
  return rows[0] ?? null;
}

export async function deleteRecipe(id: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM ${SCHEMA}.recipes WHERE id = $1`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}
