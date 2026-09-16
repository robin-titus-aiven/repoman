import { useRef, useState } from 'react';
import { Alert, Box, Grid, Input, Modal, Select, Textarea } from '@aivenio/aquarium';
import {
  CATEGORIES,
  DIFFICULTIES,
  type Category,
  type Difficulty,
  type Recipe,
  type RecipeDraft,
} from './recipes';

const FORM_ID = 'recipe-form';

interface FormValues {
  name: string;
  category: Category;
  region: string;
  minutes: string;
  servings: string;
  difficulty: Difficulty;
  description: string;
  ingredients: string;
  method: string;
}

interface FormErrors {
  name?: string;
  minutes?: string;
  servings?: string;
  ingredients?: string;
}

const emptyValues = (): FormValues => ({
  name: '',
  category: 'Pasta',
  region: '',
  minutes: '30',
  servings: '4',
  difficulty: 'Easy',
  description: '',
  ingredients: '',
  method: '',
});

const toValues = (recipe: Recipe): FormValues => ({
  name: recipe.name,
  category: recipe.category,
  region: recipe.region,
  minutes: String(recipe.minutes),
  servings: String(recipe.servings),
  difficulty: recipe.difficulty,
  description: recipe.description,
  ingredients: recipe.ingredients,
  method: recipe.method,
});

const validate = (values: FormValues): FormErrors => {
  const errors: FormErrors = {};
  if (values.name.trim().length === 0) {
    errors.name = 'Give the recipe a name';
  }
  if (!Number.isFinite(Number(values.minutes)) || Number(values.minutes) <= 0) {
    errors.minutes = 'Enter the total time in minutes';
  }
  if (!Number.isFinite(Number(values.servings)) || Number(values.servings) <= 0) {
    errors.servings = 'Enter how many people it serves';
  }
  if (values.ingredients.trim().length === 0) {
    errors.ingredients = 'List at least one ingredient';
  }
  return errors;
};

interface Props {
  open: boolean;
  /** The recipe being edited, or null when adding a new one. */
  recipe: Recipe | null;
  /** True while the save request is in flight. */
  saving: boolean;
  /** A failed save, reported by the server. */
  submitError: string | null;
  onClose: () => void;
  onSave: (draft: RecipeDraft) => void;
}

export function RecipeFormModal({
  open,
  recipe,
  saving,
  submitError,
  onClose,
  onSave,
}: Props) {
  // Seeded at mount: the caller remounts this component for each open, and Aquarium's
  // character counters only read their field's length once.
  const [values, setValues] = useState<FormValues>(() =>
    recipe ? toValues(recipe) : emptyValues(),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validate(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    onSave({
      name: values.name.trim(),
      category: values.category,
      region: values.region.trim(),
      minutes: Number(values.minutes),
      servings: Number(values.servings),
      difficulty: values.difficulty,
      description: values.description.trim(),
      ingredients: values.ingredients,
      method: values.method,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={recipe ? 'Edit recipe' : 'Add recipe'}
      subtitle={
        recipe
          ? 'Update the details and save your changes.'
          : 'Add a dish to your Italian collection.'
      }
      primaryAction={{
        text: saving ? 'Saving…' : recipe ? 'Save changes' : 'Add recipe',
        actionKey: recipe ? 'save' : 'create',
        disabled: saving,
        // The footer renders outside the body, so the form is submitted through its ref.
        onClick: () => formRef.current?.requestSubmit(),
      }}
      secondaryActions={{ text: 'Cancel', onClick: onClose }}
    >
      <form ref={formRef} id={FORM_ID} onSubmit={handleSubmit} noValidate>
        {/* Each labelled field already reserves ~27px below itself for helper
            text, so the stack only needs a small gap on top of that. */}
        <Box.Flex flexDirection="column" gap="3">
          {submitError !== null && (
            <Alert type="error">{submitError}</Alert>
          )}

          <Input
            labelText="Recipe name"
            placeholder="Cacio e Pepe"
            required
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            valid={errors.name === undefined}
            helperText={errors.name}
          />

          <Grid gap="4">
            <Grid.Item xs={12} sm={6}>
              <Select
                labelText="Category"
                placeholder="Select category"
                required
                options={CATEGORIES.map((category) => ({
                  value: category,
                  label: category,
                }))}
                value={values.category}
                onChange={(option) => {
                  if (option) {
                    set('category', option.value as Category);
                  }
                }}
              />
            </Grid.Item>
            <Grid.Item xs={12} sm={6}>
              <Select
                labelText="Difficulty"
                placeholder="Select difficulty"
                options={DIFFICULTIES.map((difficulty) => ({
                  value: difficulty,
                  label: difficulty,
                }))}
                value={values.difficulty}
                onChange={(option) => {
                  if (option) {
                    set('difficulty', option.value as Difficulty);
                  }
                }}
              />
            </Grid.Item>
          </Grid>

          <Grid gap="4">
            <Grid.Item xs={12} sm={4}>
              <Input
                labelText="Region"
                placeholder="Lazio"
                value={values.region}
                onChange={(event) => set('region', event.target.value)}
              />
            </Grid.Item>
            <Grid.Item xs={12} sm={4}>
              <Input
                labelText="Total time"
                type="number"
                min={1}
                required
                endAdornment={<span>min</span>}
                value={values.minutes}
                onChange={(event) => set('minutes', event.target.value)}
                valid={errors.minutes === undefined}
                helperText={errors.minutes}
              />
            </Grid.Item>
            <Grid.Item xs={12} sm={4}>
              <Input
                labelText="Servings"
                type="number"
                min={1}
                required
                value={values.servings}
                onChange={(event) => set('servings', event.target.value)}
                valid={errors.servings === undefined}
                helperText={errors.servings}
              />
            </Grid.Item>
          </Grid>

          <Textarea
            labelText="Description"
            placeholder="What makes this dish worth cooking?"
            rows={2}
            maxLength={200}
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
          />

          <Textarea
            labelText="Ingredients"
            description="One ingredient per line."
            placeholder={'200 g spaghetti\n100 g Pecorino Romano'}
            rows={6}
            required
            value={values.ingredients}
            onChange={(event) => set('ingredients', event.target.value)}
            valid={errors.ingredients === undefined}
            helperText={errors.ingredients}
          />

          <Textarea
            labelText="Method"
            description="One step per line."
            placeholder={'Toast the pepper in a dry pan.\nCook the pasta until al dente.'}
            rows={6}
            value={values.method}
            onChange={(event) => set('method', event.target.value)}
          />
        </Box.Flex>
      </form>
    </Modal>
  );
}
