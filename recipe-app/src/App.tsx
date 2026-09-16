import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  Chip,
  ChipContainer,
  Dialog,
  Drawer,
  EmptyState,
  Grid,
  PageHeader,
  SearchInput,
  SegmentedControl,
  SegmentedControlGroup,
  Tabs,
  Typography,
} from '@aivenio/aquarium';
import {
  CATEGORIES,
  lines,
  type Category,
  type Recipe,
  type RecipeDraft,
} from './recipes';
import * as api from './api';
import { RecipeFormModal } from './RecipeFormModal';
import { useColorScheme, type ColorScheme } from './useColorScheme';

type CategoryFilter = 'All' | Category;

const TABS: CategoryFilter[] = ['All', ...CATEGORIES];

const messageFor = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const steps = lines(recipe.method);
  const facts = [
    recipe.category,
    recipe.region,
    `${recipe.minutes} min`,
    `Serves ${recipe.servings}`,
    recipe.difficulty,
  ].filter((fact) => fact.length > 0);

  return (
    <Box.Flex flexDirection="column" gap="l1">
      <ChipContainer>
        {facts.map((fact) => (
          <Chip key={fact} text={fact} />
        ))}
      </ChipContainer>

      {recipe.description.length > 0 && (
        <Typography.Default>{recipe.description}</Typography.Default>
      )}

      <Box.Flex flexDirection="column" gap="3">
        <Typography.Subheading>Ingredients</Typography.Subheading>
        {lines(recipe.ingredients).map((ingredient) => (
          <Typography.Default key={ingredient}>• {ingredient}</Typography.Default>
        ))}
      </Box.Flex>

      {steps.length > 0 && (
        <Box.Flex flexDirection="column" gap="3">
          <Typography.Subheading>Method</Typography.Subheading>
          {steps.map((step, index) => (
            <Box.Flex key={step} gap="3">
              <Typography.DefaultStrong>{index + 1}.</Typography.DefaultStrong>
              <Typography.Default>{step}</Typography.Default>
            </Box.Flex>
          ))}
        </Box.Flex>
      )}
    </Box.Flex>
  );
}

export function App() {
  const { scheme, chooseScheme } = useColorScheme();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CategoryFilter>('All');
  const [query, setQuery] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  // Bumped on every open so the form remounts with fresh field values.
  const [formSession, setFormSession] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Recipe | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    try {
      setRecipes(await api.fetchRecipes());
      setLoadError(null);
    } catch (error) {
      setLoadError(messageFor(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecipes();
  }, [loadRecipes]);

  // The drawer animates itself out, so its content outlives `drawerOpen`.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewing, setViewing] = useState<Recipe | null>(null);

  const visibleRecipes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipes.filter((recipe) => {
      const inCategory = activeTab === 'All' || recipe.category === activeTab;
      const matchesQuery =
        needle.length === 0 ||
        [recipe.name, recipe.region, recipe.description, recipe.ingredients]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      return inCategory && matchesQuery;
    });
  }, [recipes, activeTab, query]);

  const countFor = (tab: CategoryFilter) =>
    tab === 'All'
      ? recipes.length
      : recipes.filter((recipe) => recipe.category === tab).length;

  const openAddRecipe = () => {
    setEditing(null);
    setSaveError(null);
    setFormSession((session) => session + 1);
    setFormOpen(true);
  };

  const openRecipe = (recipe: Recipe) => {
    setViewing(recipe);
    setDrawerOpen(true);
  };

  const openEditRecipe = (recipe: Recipe) => {
    setDrawerOpen(false);
    setEditing(recipe);
    setSaveError(null);
    setFormSession((session) => session + 1);
    setFormOpen(true);
  };

  /** The drawer stacks above the dialog, so it has to give way before confirming. */
  const askToDelete = (recipe: Recipe) => {
    setDrawerOpen(false);
    setDeleteError(null);
    setPendingDelete(recipe);
  };

  /** The row the server stored is what goes into state, ids and all. */
  const saveRecipe = async (draft: RecipeDraft) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        const updated = await api.updateRecipe(editing.id, draft);
        setRecipes((current) =>
          current.map((recipe) => (recipe.id === updated.id ? updated : recipe)),
        );
        setViewing((current) =>
          current?.id === updated.id ? updated : current,
        );
      } else {
        const created = await api.createRecipe(draft);
        setRecipes((current) => [created, ...current]);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (error) {
      // The modal stays open so the entered values survive a failed save.
      setSaveError(messageFor(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async () => {
    if (!pendingDelete) {
      return;
    }
    try {
      await api.deleteRecipe(pendingDelete.id);
      setRecipes((current) =>
        current.filter((recipe) => recipe.id !== pendingDelete.id),
      );
      setPendingDelete(null);
      setDrawerOpen(false);
      setDeleteError(null);
    } catch (error) {
      setDeleteError(messageFor(error));
    }
  };

  const recipeGrid = loading ? (
    <EmptyState title="Loading recipes…" fullHeight={false}>
      Fetching your collection from the database.
    </EmptyState>
  ) : loadError !== null ? (
    <EmptyState
      title="Could not load your recipes"
      fullHeight={false}
      primaryAction={{ text: 'Try again', onClick: () => void loadRecipes() }}
    >
      {loadError}
    </EmptyState>
  ) : visibleRecipes.length === 0 ? (
    <EmptyState
      title={query.trim().length > 0 ? 'No matching recipes' : 'No recipes here yet'}
      fullHeight={false}
      primaryAction={{ text: 'Add recipe', onClick: openAddRecipe }}
    >
      {query.trim().length > 0
        ? 'Try a different name, region or ingredient.'
        : 'Add your first dish in this category to get started.'}
    </EmptyState>
  ) : (
    <Grid gap="4">
      {visibleRecipes.map((recipe) => (
        <Grid.Item key={recipe.id} xs={12} sm={6} lg={4}>
          <Card
            fullWidth
            title={recipe.name}
            clampTitle={1}
            chips={[recipe.category, `${recipe.minutes} min`, recipe.difficulty]}
            primaryAction={{ text: 'View recipe', onClick: () => openRecipe(recipe) }}
            secondaryAction={{ text: 'Edit', onClick: () => openEditRecipe(recipe) }}
          >
            {recipe.description}
          </Card>
        </Grid.Item>
      ))}
    </Grid>
  );

  return (
    <Box paddingX="l2" paddingY="l1">
      <Box.Flex flexDirection="column" gap="l1">
        <PageHeader
          title="Cucina"
          subtitle="Your Italian recipe collection — pasta, pizza and meats in one place."
          primaryAction={{ text: 'Add recipe', onClick: openAddRecipe }}
        />

        <Box.Flex gap="4" alignItems="center">
          <Box width="1/3">
            <SearchInput
              aria-label="Search recipes"
              placeholder="Search by name, region or ingredient"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Box>
          <Typography.Small>
            Showing {visibleRecipes.length} of {recipes.length} recipes
          </Typography.Small>
          <Box marginLeft="auto">
            <SegmentedControlGroup
              ariaLabel="Color scheme"
              value={scheme}
              onChange={(next) => chooseScheme(next as ColorScheme)}
            >
              <SegmentedControl value="light">Light</SegmentedControl>
              <SegmentedControl value="dark">Dark</SegmentedControl>
            </SegmentedControlGroup>
          </Box>
        </Box.Flex>

        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab(value as CategoryFilter)}
          aria-label="Recipe categories"
        >
          {TABS.map((tab) => (
            <Tabs.Tab key={tab} value={tab} title={tab} badge={countFor(tab)}>
              <Box paddingTop="l1">{recipeGrid}</Box>
            </Tabs.Tab>
          ))}
        </Tabs>
      </Box.Flex>

      <RecipeFormModal
        key={formSession}
        open={formOpen}
        recipe={editing}
        saving={saving}
        submitError={saveError}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={saveRecipe}
      />

      <Drawer
        size="md"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={viewing?.name ?? 'Recipe'}
        primaryAction={{
          text: 'Edit recipe',
          onClick: () => viewing && openEditRecipe(viewing),
        }}
        secondaryActions={[
          { text: 'Delete', onClick: () => viewing && askToDelete(viewing) },
        ]}
      >
        {viewing && <RecipeDetail recipe={viewing} />}
      </Drawer>

      <Dialog
        type="warning"
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this recipe?"
        primaryAction={{ text: 'Delete recipe', onClick: () => void deleteRecipe() }}
        secondaryAction={{ text: 'Cancel', onClick: () => setPendingDelete(null) }}
      >
        {deleteError ??
          (pendingDelete
            ? `${pendingDelete.name} will be removed from your collection. This cannot be undone.`
            : '')}
      </Dialog>
    </Box>
  );
}
