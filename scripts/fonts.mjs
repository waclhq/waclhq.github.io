/**
 * Refresh the self-hosted webfonts in public/fonts.
 *
 * The site used to link fonts.googleapis.com, which is a render-blocking
 * stylesheet on someone else's origin: a slow lookup holds the first paint of
 * every page. So the faces live here instead. This script asks Google for the
 * same CSS a browser would get, keeps the latin subset of each face, saves the
 * woff2 files under public/fonts, and prints the @font-face rules to paste
 * into the inline <style> in index.html.
 *
 *   node scripts/fonts.mjs
 *
 * Run it only when the type stack changes (see the design notes in CLAUDE.md).
 */

import fs from 'node:fs'
import path from 'node:path'

const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;1,700;1,800' +
  '&family=Inter:wght@400..700&family=IBM+Plex+Mono:wght@400;500;600&display=swap'

// Google serves woff2 only to browsers that ask like one.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const OUT = path.join(process.cwd(), 'public', 'fonts')
fs.mkdirSync(OUT, { recursive: true })

const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text()
const faces = css.split('@font-face').slice(1).map((block) => '@font-face' + block.split('}')[0] + '}')
const latin = faces.filter((face) => /unicode-range: U\+0000-00FF/.test(face))

const rules = []
for (const face of latin) {
  const url = /url\((https:[^)]+)\)/.exec(face)[1]
  const family = /font-family: '([^']+)'/.exec(face)[1]
  const weight = /font-weight: ([\d ]+)/.exec(face)[1].trim()
  const italic = /font-style: italic/.test(face)
  // A weight range means Google returned the variable file for that family.
  const variable = weight.includes(' ')
  const file = `${family.toLowerCase().replace(/ /g, '-')}-${variable ? 'var' : weight}${italic ? '-italic' : ''}.woff2`
  const bytes = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer())
  fs.writeFileSync(path.join(OUT, file), bytes)
  rules.push(
    `      @font-face{font-family:'${family}';font-style:${italic ? 'italic' : 'normal'};` +
      `font-weight:${weight};font-display:swap;src:url(/fonts/${file}) ` +
      `format('${variable ? 'woff2-variations' : 'woff2'}')}`,
  )
  console.error(`saved ${file} (${Math.round(bytes.length / 1024)}kb)`)
}

console.log(rules.join('\n'))
