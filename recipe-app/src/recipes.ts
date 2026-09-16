export const CATEGORIES = ['Pasta', 'Pizza', 'Meats'] as const;
export type Category = (typeof CATEGORIES)[number];

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface Recipe {
  id: string;
  name: string;
  category: Category;
  region: string;
  minutes: number;
  servings: number;
  difficulty: Difficulty;
  description: string;
  /** One ingredient per line. */
  ingredients: string;
  /** One step per line. */
  method: string;
}

export type RecipeDraft = Omit<Recipe, 'id'>;

/** Splits the newline-delimited ingredient and method fields into display rows. */
export const lines = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
