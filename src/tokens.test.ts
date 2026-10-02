import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Design rule (DESIGN.md): components use tokens only. No raw hex colours and no
// default Tailwind palette classes (bg-gray-100, text-green-600, ...). Tokens live in index.css.

const HEX = /#[0-9a-fA-F]{3,8}\b/
const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('design tokens', () => {
  it('has no raw hex colours or default palette classes in source', () => {
    const offenders = sourceFiles('src').flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (HEX.test(line) || PALETTE.test(line) ? [`${file}:${i + 1}  ${line.trim()}`] : [])),
    )
    expect(offenders, 'Use a token from src/index.css instead:\n' + offenders.join('\n')).toEqual([])
  })
})
