export function formatBasisPointsForDisplay(basisPoints: number): string {
  const safe = Number.isInteger(basisPoints) && basisPoints >= 0 ? basisPoints : 0
  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, '0')}%`
}
