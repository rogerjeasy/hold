import { slugOf } from './slug.ts'

// The views staff photograph for one kind of item, in the order the camera asks for them (architecture.md section
// 9.1). A plan is never changed once saved: an edit saves a new plan, so a return is always compared view by view
// with the handover it follows.

// What a shop rents, as the kinds the public pages name. Each has a suggested plan the shop adjusts.
export const ITEM_CATEGORIES = ['bike', 'e_bike', 'scooter', 'water', 'snow', 'camera', 'camping', 'event', 'tool', 'other'] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

// The framing outline the camera draws over a view.
export const VIEW_OUTLINES = ['whole_side', 'front', 'rear', 'top', 'detail'] as const
export type ViewOutline = (typeof VIEW_OUTLINES)[number]

export const PHOTO_PLAN_LIMITS = { views: 12, label: 60 } as const

export type PhotoPlanViewDraft = { readonly label: string; readonly outline: ViewOutline; readonly required: boolean }

export type PhotoPlanProblem =
  | { readonly kind: 'no_views' }
  | { readonly kind: 'too_many_views' }
  | { readonly kind: 'no_required_view' }
  | { readonly kind: 'view_label_missing'; readonly view: number }
  | { readonly kind: 'view_label_too_long'; readonly view: number }
  | { readonly kind: 'view_label_repeated'; readonly view: number }

export function checkPhotoPlan(views: readonly PhotoPlanViewDraft[]): readonly PhotoPlanProblem[] {
  if (views.length === 0) return [{ kind: 'no_views' }]
  if (views.length > PHOTO_PLAN_LIMITS.views) return [{ kind: 'too_many_views' }]
  const problems: PhotoPlanProblem[] = []
  const seen = new Set<string>()
  views.forEach((view, index) => {
    const label = view.label.trim()
    const key = label.toLowerCase()
    if (label === '') problems.push({ kind: 'view_label_missing', view: index })
    else if (label.length > PHOTO_PLAN_LIMITS.label) problems.push({ kind: 'view_label_too_long', view: index })
    else if (seen.has(key)) problems.push({ kind: 'view_label_repeated', view: index })
    seen.add(key)
  })
  if (!views.some((view) => view.required)) problems.push({ kind: 'no_required_view' })
  return problems
}

// The key each view's photographs are filed under. Two labels can make one key; the later one is numbered.
export function viewKeys(views: readonly PhotoPlanViewDraft[]): readonly string[] {
  const keys = new Set<string>()
  return views.map((view, index) => {
    let key = slugOf(view.label)
    if (key === '') key = `view-${String(index + 1)}`
    if (keys.has(key)) key = `${key}-${String(index + 1)}`
    keys.add(key)
    return key
  })
}

export type SuggestedView = { readonly key: string; readonly outline: ViewOutline; readonly required: boolean }

const view = (key: string, outline: ViewOutline, required = true): SuggestedView => ({ key, outline, required })

// The keys name the suggestion, and the web app words each one in the person's language before it is saved.
const SUGGESTED: Readonly<Record<ItemCategory, readonly SuggestedView[]>> = {
  bike: [
    view('frame_left', 'whole_side'),
    view('frame_right', 'whole_side'),
    view('front_wheel', 'front'),
    view('rear_wheel', 'rear'),
    view('saddle', 'detail', false),
    view('handlebar', 'detail', false),
  ],
  e_bike: [
    view('frame_left', 'whole_side'),
    view('frame_right', 'whole_side'),
    view('front_wheel', 'front'),
    view('rear_wheel', 'rear'),
    view('display', 'detail'),
    view('battery', 'detail'),
  ],
  scooter: [view('deck_left', 'whole_side'), view('deck_right', 'whole_side'), view('front', 'front'), view('rear', 'rear'), view('display', 'detail')],
  water: [view('deck', 'top'), view('hull', 'top'), view('side_left', 'whole_side'), view('side_right', 'whole_side'), view('bow', 'front', false), view('stern', 'rear', false)],
  snow: [view('top_sheet', 'top'), view('base', 'top'), view('edges', 'detail'), view('bindings', 'detail')],
  camera: [view('front', 'front'), view('back', 'rear'), view('top', 'top'), view('lens_glass', 'detail'), view('mount', 'detail', false)],
  camping: [view('whole', 'whole_side'), view('fabric', 'detail'), view('zips', 'detail', false), view('poles', 'detail', false)],
  event: [view('front', 'front'), view('back', 'rear'), view('top', 'top'), view('detail', 'detail', false)],
  tool: [view('whole', 'whole_side'), view('working_end', 'detail'), view('cable', 'detail', false), view('serial_plate', 'detail', false)],
  other: [view('front', 'front'), view('back', 'rear'), view('side_left', 'whole_side'), view('side_right', 'whole_side')],
}

export function suggestedPhotoPlan(category: ItemCategory): readonly SuggestedView[] {
  return SUGGESTED[category]
}
