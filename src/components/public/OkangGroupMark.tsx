import Image from "next/image"

type OkangGroupMarkProps = {
  className?: string
}

/** Same footprint as the previous OG badge (h-5 / 20px). */
const MARK_SIZE = 20

/**
 * Parent-company attribution used on public footers.
 * Logo mark sits beside the Okang Group wordmark at the size of the
 * badge it replaces; inline dimensions defeat the unlayered
 * `img { height: auto }` rule in globals.css.
 */
export default function OkangGroupMark({ className = "" }: OkangGroupMarkProps) {
  return (
    <p
      className={`inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 ${className}`}
    >
      <Image
        src="/brand/okang-group.png"
        alt=""
        width={MARK_SIZE}
        height={MARK_SIZE}
        unoptimized
        aria-hidden
        style={{ width: MARK_SIZE, height: MARK_SIZE }}
        className="shrink-0 rounded object-cover"
      />
      <span>
        By <span className="text-slate-300">Okang Group</span>
      </span>
    </p>
  )
}
