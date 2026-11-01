import { z } from 'zod'

// How a form's fields are read, shared by the web app's server functions and the phone app, so one schema checks the
// input in both places.

// Locale travels with every form, for the words of what follows. It is not part of any action's input.
export const withLocale = <Shape extends z.ZodRawShape>(shape: Shape) => z.object({ ...shape, locale: z.string().max(5) }).strict()

// A field a form may send once or many times, read as a list either way. A form with no such row sends none.
export const list = <Item extends z.ZodType<string>>(item: Item) =>
  z
    .union([item, z.array(item)])
    .optional()
    .transform((value): z.infer<Item>[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]))
