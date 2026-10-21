import { z } from 'zod';

/** The colours a category can have, shown as large swatches. Readable in light and dark mode. */
export const CATEGORY_COLORS = [
  '#2f6f9f',
  '#3d8b5a',
  '#b7791f',
  '#a64545',
  '#7a5ba6',
  '#2f8f8f',
  '#8a6d3b',
  '#5f6b7a',
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const CATEGORY_NAME_MAX = 60;

export interface Category {
  id: number;
  name: string;
  color: CategoryColor | null;
  /** Areas in use (not deleted) in this category. */
  areaCount: number;
}

const idSchema = z.number().int().positive();

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
    color: z.enum(CATEGORY_COLORS).nullable(),
  })
  .strict();
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryUpdateSchema = categoryInputSchema.extend({ id: idSchema }).strict();
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

export const idInputSchema = z.object({ id: idSchema }).strict();
export type IdInput = z.infer<typeof idInputSchema>;

export type CategorySaveResult =
  { ok: true; id: number } | { ok: false; reason: 'duplicate_name' | 'not_found' };

export type CategoryDeleteResult = { ok: true } | { ok: false; reason: 'has_areas' | 'not_found' };
