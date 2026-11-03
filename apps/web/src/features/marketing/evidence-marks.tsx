import { evidencePhoto } from './evidence-photo'

const TAG_HEIGHT = 30
const TAG_PADDING = 22
const TAG_CHARACTER_WIDTH = 12.5

// Drawn inside an <svg> whose viewBox uses the photograph's own frame, so the outlines stay on the marks.
export function EvidenceMarks({ showNew, newLabel }: { showNew: boolean; newLabel: string }) {
  const { newMark, oldMark } = evidencePhoto
  const tagWidth = newLabel.length * TAG_CHARACTER_WIDTH + TAG_PADDING

  return (
    <>
      <rect
        x={oldMark.x}
        y={oldMark.y}
        width={oldMark.size}
        height={oldMark.size}
        strokeWidth="2.5"
        strokeDasharray="8 6"
        className="fill-none stroke-photo-foreground"
      />
      {showNew ? (
        // The new mark arrives with a small spring each time it is shown.
        <g className="animate-pop origin-center [transform-box:fill-box]">
          <rect x={newMark.x} y={newMark.y} width={newMark.size} height={newMark.size} strokeWidth="4" className="fill-none stroke-mark" />
          <rect x={newMark.x - 2} y={newMark.y - TAG_HEIGHT} width={tagWidth} height={TAG_HEIGHT} className="fill-mark" />
          <text
            x={newMark.x - 2 + tagWidth / 2}
            y={newMark.y - 9}
            textAnchor="middle"
            className="fill-mark-foreground font-mono text-[19px] font-medium tracking-wider uppercase"
          >
            {newLabel}
          </text>
        </g>
      ) : null}
    </>
  )
}
