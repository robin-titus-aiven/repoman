import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { pool } from './db.js';
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

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'reachable' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
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
app.get('*', (_req, res) => {
  res.sendFile(path.join(STATIC_ROOT, 'index.html'));
});

async function start() {
  await initialiseSchema();
  // 0.0.0.0 rather than localhost, or the container would be unreachable.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cucina listening on 0.0.0.0:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start', error);
  process.exit(1);
});
