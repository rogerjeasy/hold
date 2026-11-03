import type { ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Only these kinds of link are followed. Anything else a model writes, such as a javascript: or data: address, is
// shown as plain text.
const FOLLOWED = /^(https?:|mailto:)/i

// A heading in a reply sits below the page's own h1 and h2, so the page's outline stays the page's.
const heading = (Tag: 'h3' | 'h4', size: string) => ({ children }: ComponentProps<'h3'>) => <Tag className={`${size} font-semibold text-balance`}>{children}</Tag>

// Each element a model may write, drawn with the design tokens. Nothing here can run script, load a picture or reach
// another page without the reader choosing to follow a link.
const COMPONENTS: Components = {
  p: ({ children }) => <p className="text-pretty">{children}</p>,
  h1: heading('h3', 'text-lg'),
  h2: heading('h3', 'text-lg'),
  h3: heading('h4', 'text-base'),
  h4: heading('h4', 'text-base'),
  h5: heading('h4', 'text-base'),
  h6: heading('h4', 'text-base'),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="grid list-disc gap-1 ps-5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="grid list-decimal gap-1 ps-5 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="ps-1 [&>ol]:mt-1 [&>ul]:mt-1">{children}</li>,
  blockquote: ({ children }) => <blockquote className="grid gap-2 border-l-2 border-border-strong ps-3 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="border-border" />,
  a: ({ href, children }) =>
    href !== undefined && FOLLOWED.test(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4 wrap-long-words">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // A picture a model names is never fetched: its description stands in its place.
  img: ({ alt }) => <span className="text-muted-foreground">{alt}</span>,
  code: ({ children }) => <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.875em]">{children}</code>,
  pre: ({ children }) => <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm leading-relaxed [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
  // A wide table scrolls inside its own box; the reply and the page around it stay still.
  table: ({ children }) => (
    <div className="max-w-full overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  th: ({ children, style }) => <th style={style} className="border-b border-border px-3 py-2 text-left font-semibold whitespace-nowrap">{children}</th>,
  td: ({ children, style }) => <td style={style} className="border-b border-border px-3 py-2 align-top [tr:last-child_&]:border-b-0">{children}</td>,
}

// Text a model wrote, shown as the structure it means: paragraphs, emphasis, lists, headings, tables (GitHub's
// Markdown), code and links. HTML in the text is dropped, never rendered.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="grid min-w-0 gap-2.5 wrap-long-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}
