import type { Recipe, RecipeDraft } from './recipes';

/** Surfaces the server's own message so the UI can show something useful. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }

  // 204 on delete, which has no body to parse.
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const fetchRecipes = () => request<Recipe[]>('/recipes');

export const createRecipe = (draft: RecipeDraft) =>
  request<Recipe>('/recipes', { method: 'POST', body: JSON.stringify(draft) });

export const updateRecipe = (id: string, draft: RecipeDraft) =>
  request<Recipe>(`/recipes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(draft),
  });

export const deleteRecipe = (id: string) =>
  request<void>(`/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' });
