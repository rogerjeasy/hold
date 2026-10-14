export type Figure = {
  value: string
  label: string
}

// A row of numbers that carry the page's argument. Each one is a fact the product keeps.
export function FigureStrip({ figures }: { figures: readonly Figure[] }) {
  return (
    <ul role="list" className="grid grid-cols-2 border-t border-t-foreground lg:grid-cols-4">
      {figures.map((figure) => (
        <li key={figure.label} className="border-b py-5 pr-4 even:border-l even:pl-4 lg:border-b-0 lg:pb-0 lg:not-first:border-l lg:not-first:pl-6">
          <p className="text-headline wrap-long-words">{figure.value}</p>
          <p className="mt-2 text-[0.9375rem] text-muted-foreground">{figure.label}</p>
        </li>
      ))}
    </ul>
  )
}
