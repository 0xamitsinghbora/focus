const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')

function getDbPath() {
  let appDataDir = ''
  if (process.platform === 'win32') {
    appDataDir = path.join(
      process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'),
      'focus'
    )
  } else if (process.platform === 'darwin') {
    appDataDir = path.join(process.env.HOME || '', 'Library', 'Application Support', 'focus')
  } else {
    appDataDir = process.env.XDG_CONFIG_HOME
      ? path.join(process.env.XDG_CONFIG_HOME, 'focus')
      : path.join(process.env.HOME || '', '.config', 'focus')
  }
  return path.join(appDataDir, 'focus-logs', 'focus.db')
}

const dbPath = getDbPath()
console.log(`\nSQLite Database: ${dbPath}`)

if (!fs.existsSync(dbPath)) {
  console.log('Database file does not exist yet. Run "npm run dev" first so the app creates it.\n')
  process.exit(1)
}

// Open the .db file directly in VS Code (which opens SQLite Viewer)
console.log('Opening in VS Code SQLite Viewer...\n')
exec(`code "${dbPath}"`, (err) => {
  if (err) {
    console.warn('Could not run "code" CLI command automatically.')
    console.log(`You can open it from File -> Open File in VS Code:\n${dbPath}\n`)
  }
})
