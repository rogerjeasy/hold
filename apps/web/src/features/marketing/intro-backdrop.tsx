// Behind the opening of a page: a faint grid of dots that fades out towards the edges, and a warm light from the
// accent at the top. The whole backdrop fades out before the opening ends, so it never stops at a hard edge. It is
// decoration, so it is hidden from screen readers and never catches the pointer.
export function IntroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-clip [mask-image:linear-gradient(to_bottom,black_45%,transparent)]">
      <div className="dot-grid absolute inset-0 animate-fade [mask-image:radial-gradient(ellipse_70%_60%_at_30%_0%,black,transparent_75%)]" />
      <div className="absolute -top-1/3 right-0 aspect-square w-[min(48rem,90%)] rounded-full bg-primary/8 blur-3xl dark:bg-primary/10" />
    </div>
  )
}
