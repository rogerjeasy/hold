// A mark's box on a photograph, in fractions of its width and height, as Hold stores it (architecture.md section 9.4).
export type Region = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type Point = { readonly x: number; readonly y: number };

// A tap boxes this much of the photograph around the finger; a drag draws the box itself.
const TAPPED = 0.2;
// Smaller than this, a drag was a tap.
const SMALLEST = 0.03;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
const round = (value: number) => Math.round(value * 10_000) / 10_000;
const rounded = (region: Region): Region => ({ x: round(region.x), y: round(region.y), width: round(region.width), height: round(region.height) });

export const pointIn = (location: { locationX: number; locationY: number }, size: { width: number; height: number }): Point => ({
  x: clamp(size.width === 0 ? 0 : location.locationX / size.width, 0, 1),
  y: clamp(size.height === 0 ? 0 : location.locationY / size.height, 0, 1),
});

// A box centred on a tapped point, kept inside the photograph.
export function boxAround(point: Point): Region {
  return rounded({ x: clamp(point.x - TAPPED / 2, 0, 1 - TAPPED), y: clamp(point.y - TAPPED / 2, 0, 1 - TAPPED), width: TAPPED, height: TAPPED });
}

// The box between where a drag started and where the finger is now; a tiny one is read as a tap.
export function boxBetween(start: Point, end: Point): Region {
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < SMALLEST && height < SMALLEST) return boxAround(end);
  return rounded({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.max(width, SMALLEST), height: Math.max(height, SMALLEST) });
}

export const DEFAULT_BOX: Region = boxAround({ x: 0.5, y: 0.5 });
