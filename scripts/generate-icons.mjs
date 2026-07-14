/**
 * Renders public/icon.svg into PNG, ICO, and ICNS for electron-builder.
 * Auto-centers the :D mark using the rendered pixel bounding box.
 * Run: npm run icons
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import toIco from 'to-ico'
import png2icons from 'png2icons'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'public', 'icon.svg')
const publicDir = path.join(root, 'public')
const linuxIconDir = path.join(root, 'build', 'icons')
const CANVAS = 512
const CENTER = CANVAS / 2

async function measureMarkCenter(svg) {
  const { data, info } = await sharp(svg).resize(CANVAS, CANVAS).raw().toBuffer({ resolveWithObject: true })
  let minX = info.width
  let minY = info.height
  let maxX = 0
  let maxY = 0
  let count = 0

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r + g + b < 120) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        count++
      }
    }
  }

  if (count === 0) throw new Error('Could not measure :D mark in icon.svg')

  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  }
}

async function buildCenteredSvg(source) {
  let svg = source.toString()

  for (let pass = 0; pass < 8; pass++) {
    const { cx, cy } = await measureMarkCenter(Buffer.from(svg))
    const errX = cx - CENTER
    const errY = cy - CENTER
    if (Math.abs(errX) < 0.25 && Math.abs(errY) < 0.25) break

    const match = svg.match(/<g id="mark" transform="translate\(([-\d.]+)\s+([-\d.]+)\)">/)
    const curX = match ? parseFloat(match[1]) : CENTER
    const curY = match ? parseFloat(match[2]) : CENTER
    const nextX = curX - errX
    const nextY = curY - errY

    svg = svg.replace(
      /<g id="mark" transform="translate\([^"]+\)">/,
      `<g id="mark" transform="translate(${nextX.toFixed(2)} ${nextY.toFixed(2)})">`,
    )
  }

  return svg
}

async function main() {
  const source = fs.readFileSync(svgPath)
  const svg = await buildCenteredSvg(source)
  const { cx, cy } = await measureMarkCenter(Buffer.from(svg))
  console.log(`Centered :D at (${cx.toFixed(1)}, ${cy.toFixed(1)}) — target (${CENTER}, ${CENTER})`)

  fs.writeFileSync(svgPath, svg)

  const png512Path = path.join(publicDir, 'icon.png')
  await sharp(Buffer.from(svg)).resize(CANVAS, CANVAS).png().toFile(png512Path)

  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const icoBuffers = await Promise.all(
    icoSizes.map(size => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()),
  )
  fs.writeFileSync(path.join(publicDir, 'icon.ico'), await toIco(icoBuffers))

  // Windows gets a slightly larger mark so the :D reads well at Start-menu / .exe sizes.
  const windowsSvg = svg.replace(/font-size="170"/, 'font-size="210"')
  const windowsIcoSizes = [16, 20, 24, 30, 32, 40, 48, 60, 64, 72, 80, 96, 128, 256]
  const windowsIcoBuffers = await Promise.all(
    windowsIcoSizes.map(size => sharp(Buffer.from(windowsSvg)).resize(size, size).png().toBuffer()),
  )
  fs.writeFileSync(path.join(publicDir, 'icon-windows.ico'), await toIco(windowsIcoBuffers))

  const png512 = fs.readFileSync(png512Path)
  const icns = png2icons.createICNS(png512, png2icons.BICUBIC, 0)
  if (!icns) throw new Error('Failed to generate icon.icns')
  fs.writeFileSync(path.join(publicDir, 'icon.icns'), icns)

  // Linux: electron-builder reads each icon's size from its filename to place it
  // under hicolor/<size>/, so the set must be NxN.png — a plain icon.png lands in
  // hicolor/0x0/ and the desktop entry never resolves.
  fs.mkdirSync(linuxIconDir, { recursive: true })
  const linuxSizes = [16, 32, 48, 64, 128, 256, 512]
  await Promise.all(
    linuxSizes.map(size =>
      sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(path.join(linuxIconDir, `${size}x${size}.png`)),
    ),
  )

  console.log('Updated icon.svg transform and generated icon.png, icon.ico, icon.icns, build/icons/')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
