export type Figure = {
  value: string
  label: string
}

// A row of numbers that carry the page's argument. Each one is a fact the product keeps.
export function FigureStrip({ figures }: { figures: readonly Figure[] }) {
  return (
    <ul role="list" className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {figures.map((figure) => (
        <li key={figure.label} className="surface min-w-0 p-4 md:p-6">
          <p className="text-headline wrap-long-words">{figure.value}</p>
          <p className="mt-3 text-[0.9375rem] text-muted-foreground">{figure.label}</p>
        </li>
      ))}
    </ul>
  )
}
