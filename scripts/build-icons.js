const { spawnSync } = require('child_process')
const path = require('path')
const electron = require('electron')

console.log('Rendering SVG to 1024x1024 PNG with Electron...')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const renderRes = spawnSync(electron, [path.join(__dirname, 'build-icons.cjs')], {
  env,
  stdio: 'inherit'
})

if (renderRes.status !== 0) {
  console.error('Failed to render 1024 PNG')
  process.exit(renderRes.status || 1)
}

console.log('Generating multi-resolution PNGs, ICO, and ICNS with Python...')
const pyRes = spawnSync('python', [path.join(__dirname, 'generate-assets.py')], {
  stdio: 'inherit'
})

if (pyRes.status !== 0) {
  console.error('Failed to generate icon assets')
  process.exit(pyRes.status || 1)
}

if (process.platform === 'win32') {
  console.log('Patching local development electron.exe icon...')
  spawnSync('node', [path.join(__dirname, 'patch-electron-icon.js')], { stdio: 'inherit' })
}

console.log('Icon generation complete!')
