import { useMemo } from 'react'

interface Props {
  seed?: string
  bars?: number
  height?: number
  active?: number
  color?: string
  dimColor?: string
  style?: React.CSSProperties
}

export function Waveform({
  seed = 'a',
  bars = 60,
  height = 28,
  active = 0,
  color = 'var(--mp-accent)',
  dimColor = 'var(--mp-wave-dim)',
  style,
}: Props) {
  const data = useMemo(() => {
    let h = 0
    for (let i = 0; i < seed.length; i++) h = ((h * 31 + seed.charCodeAt(i)) >>> 0)
    const out: number[] = []
    for (let i = 0; i < bars; i++) {
      h = ((h * 1664525 + 1013904223) >>> 0)
      const v = ((h >>> 8) & 0xffff) / 0xffff
      const env = Math.sin((i / bars) * Math.PI) * 0.7 + 0.3
      out.push(0.2 + v * env)
    }
    return out
  }, [seed, bars])

  return (
    <svg
      viewBox={`0 0 ${bars * 3} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block', ...style }}
    >
      {data.map((v, i) => {
        const bh = v * height
        const y = (height - bh) / 2
        const isActive = i / bars <= active
        return (
          <rect
            key={i}
            x={i * 3} y={y} width={2} height={bh}
            fill={isActive ? color : dimColor}
          />
        )
      })}
    </svg>
  )
}
