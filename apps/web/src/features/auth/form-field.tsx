import { CircleAlert } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FormFieldProps = Omit<ComponentProps<typeof Input>, 'id' | 'aria-invalid' | 'aria-describedby'> & {
  name: string
  label: string
  // Shown under the field and read out with it. The icon carries the meaning for readers who do not see the colour.
  problem?: string
}

export function FormField({ name, label, problem, ...props }: FormFieldProps) {
  const problemId = `${name}-problem`

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-invalid={problem !== undefined} aria-describedby={problem === undefined ? undefined : problemId} {...props} />
      {problem === undefined ? null : (
        <p id={problemId} className="flex gap-1.5 text-[0.9375rem] text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
          {problem}
        </p>
      )}
    </div>
  )
}
