const { spawnSync, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

function patchIcon() {
  if (process.platform !== 'win32') {
    return
  }

  const projectRoot = path.resolve(__dirname, '..')
  const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  const iconIco = path.join(projectRoot, 'build', 'icon.ico')
  const rceditExe = path.join(
    projectRoot,
    'node_modules',
    'electron-winstaller',
    'vendor',
    'rcedit.exe'
  )

  if (!fs.existsSync(electronExe)) {
    console.warn('[patch-electron-icon] electron.exe not found at:', electronExe)
    return
  }
  if (!fs.existsSync(iconIco)) {
    console.warn('[patch-electron-icon] icon.ico not found at:', iconIco)
    return
  }
  if (!fs.existsSync(rceditExe)) {
    console.warn('[patch-electron-icon] rcedit.exe not found at:', rceditExe)
    return
  }

  // If electron.exe is running, release file lock by stopping it
  try {
    execSync('taskkill /F /IM electron.exe /T 2>nul || exit 0', { stdio: 'ignore', shell: true })
  } catch {
    // ignore
  }

  console.log('[patch-electron-icon] Patching electron.exe with Focus icon...')
  const res = spawnSync(
    rceditExe,
    [
      electronExe,
      '--set-icon',
      iconIco,
      '--set-version-string',
      'FileDescription',
      'Focus',
      '--set-version-string',
      'ProductName',
      'Focus'
    ],
    { stdio: 'inherit' }
  )

  if (res.status === 0) {
    console.log('[patch-electron-icon] Successfully patched electron.exe icon!')
  } else {
    console.warn('[patch-electron-icon] Failed to patch electron.exe (exit code:', res.status, ')')
  }
}

patchIcon()
