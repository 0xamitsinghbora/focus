const { spawn } = require('child_process')
const path = require('path')
const electron = require('electron')

const vitestPkg = require.resolve('vitest/package.json')
const vitestBin = path.join(path.dirname(vitestPkg), 'vitest.mjs')
const args = [vitestBin, ...process.argv.slice(2)]

const child = spawn(electron, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  }
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
