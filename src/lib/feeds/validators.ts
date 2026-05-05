/**
 * Zod validation schemas for feed source API routes.
 */
import { z } from "zod";

export const createFeedSourceSchema = z.object({
  name: z.string().min(1, "name is required").max(255, "name must be 255 characters or fewer"),
  url: z.string().url("url must be a valid URL"),
  isActive: z.boolean().optional(),
});

export const updateFeedSourceSchema = z
  .object({
    name: z
      .string()
      .min(1, "name must not be empty")
      .max(255, "name must be 255 characters or fewer")
      .optional(),
    url: z.string().url("url must be a valid URL").optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "at least one field is required for update",
  });

export type CreateFeedSourceInput = z.infer<typeof createFeedSourceSchema>;
export type UpdateFeedSourceInput = z.infer<typeof updateFeedSourceSchema>;
