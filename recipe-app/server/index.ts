import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getPool } from './db.js';
import {
  createRecipe,
  deleteRecipe,
  initialiseSchema,
  listRecipes,
  updateRecipe,
} from './recipes.js';
import {
  CATEGORIES,
  DIFFICULTIES,
  type Category,
  type Difficulty,
  type RecipeDraft,
} from '../src/recipes.js';

const PORT = Number(process.env.PORT ?? 8080);
const STATIC_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../client',
);

const app = express();
app.use(express.json({ limit: '64kb' }));

type DatabaseState =
  | { status: 'connecting' }
  | { status: 'ready' }
  | { status: 'failed'; error: string };

let database: DatabaseState = { status: 'connecting' };

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const positiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Mirrors the form's rules rather than trusting them: the API is reachable
 * independently of the UI, and the table's CHECK constraints would otherwise
 * surface as opaque 500s.
 */
const parseDraft = (body: unknown): { draft: RecipeDraft } | { error: string } => {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Expected a recipe object' };
  }
  const input = body as Record<string, unknown>;

  const name = text(input.name);
  if (name.length === 0) {
    return { error: 'Give the recipe a name' };
  }

  const category = text(input.category) as Category;
  if (!CATEGORIES.includes(category)) {
    return { error: `Category must be one of: ${CATEGORIES.join(', ')}` };
  }

  const difficulty = text(input.difficulty) as Difficulty;
  if (!DIFFICULTIES.includes(difficulty)) {
    return { error: `Difficulty must be one of: ${DIFFICULTIES.join(', ')}` };
  }

  const minutes = positiveInt(input.minutes);
  if (minutes === null) {
    return { error: 'Total time must be a positive whole number of minutes' };
  }

  const servings = positiveInt(input.servings);
  if (servings === null) {
    return { error: 'Servings must be a positive whole number' };
  }

  const ingredients = text(input.ingredients);
  if (ingredients.length === 0) {
    return { error: 'List at least one ingredient' };
  }

  return {
    draft: {
      name,
      category,
      difficulty,
      minutes,
      servings,
      ingredients,
      region: text(input.region),
      description: text(input.description),
      method: text(input.method),
    },
  };
};

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * Reports the underlying error rather than a generic failure. Misconfiguration
 * is otherwise invisible from outside the container, and the messages involved
 * name a host at worst — the connection string is never echoed.
 */
app.get('/api/health', async (_req, res) => {
  if (database.status !== 'ready') {
    res.status(503).json({
      status: 'degraded',
      database: database.status,
      ...(database.status === 'failed' && { error: database.error }),
    });
    return;
  }

  try {
    await getPool().query('SELECT 1');
    res.json({ status: 'ok', database: 'reachable' });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      database: 'unreachable',
      error: describe(error),
    });
  }
});

/** Answers 503 with the reason until the schema is in place. */
app.use('/api/recipes', (_req, res, next) => {
  if (database.status === 'ready') {
    next();
    return;
  }
  res.status(503).json({
    error:
      database.status === 'connecting'
        ? 'Connecting to the database, one moment.'
        : `Database unavailable: ${database.error}`,
  });
});

app.get('/api/recipes', async (_req, res) => {
  try {
    res.json(await listRecipes());
  } catch (error) {
    console.error('Failed to list recipes', error);
    res.status(500).json({ error: 'Could not load recipes' });
  }
});

app.post('/api/recipes', async (req, res) => {
  const parsed = parseDraft(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const id = `${slugify(parsed.draft.name) || 'recipe'}-${Date.now()}`;
    res.status(201).json(await createRecipe(id, parsed.draft));
  } catch (error) {
    console.error('Failed to create recipe', error);
    res.status(500).json({ error: 'Could not save the recipe' });
  }
});

app.put('/api/recipes/:id', async (req, res) => {
  const parsed = parseDraft(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const updated = await updateRecipe(req.params.id, parsed.draft);
    if (updated === null) {
      res.status(404).json({ error: 'No such recipe' });
      return;
    }
    res.json(updated);
  } catch (error) {
    console.error('Failed to update recipe', error);
    res.status(500).json({ error: 'Could not save your changes' });
  }
});

app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const removed = await deleteRecipe(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'No such recipe' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    console.error('Failed to delete recipe', error);
    res.status(500).json({ error: 'Could not delete the recipe' });
  }
});

// The built frontend, with the single-page-app fallback nginx used to provide.
app.use(express.static(STATIC_ROOT));

// Express 5 dropped the bare '*' route, so the fallback is plain middleware.
// Unmatched API paths still answer JSON rather than the app shell.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'No such endpoint' });
    return;
  }
  res.sendFile(path.join(STATIC_ROOT, 'index.html'));
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const RETRY_CEILING_MS = 30_000;

/**
 * Keeps trying, backing off to every 30s. A database that is briefly
 * unreachable resolves itself, and one that is misconfigured keeps saying so
 * through /api/health instead of leaving an unexplained dead container.
 */
async function connectInBackground(): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await initialiseSchema();
      database = { status: 'ready' };
      console.log('Database ready');
      return;
    } catch (error) {
      database = { status: 'failed', error: describe(error) };
      const wait = Math.min(1000 * 2 ** (attempt - 1), RETRY_CEILING_MS);
      console.error(
        `Database unavailable (attempt ${attempt}): ${database.error}. ` +
          `Retrying in ${Math.round(wait / 1000)}s`,
      );
      await delay(wait);
    }
  }
}

// Listening comes first, so a database problem surfaces as a diagnosable
// response instead of a container that exits before it can serve anything.
// 0.0.0.0 rather than localhost, or the container would be unreachable.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Cucina listening on 0.0.0.0:${PORT}`);
});

void connectInBackground();
