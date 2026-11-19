const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true
    }
  })

  const svgContent = fs.readFileSync(path.resolve(__dirname, '../build/icon.svg'), 'utf8')
  const base64Svg = Buffer.from(svgContent).toString('base64')
  const dataUri = 'data:image/svg+xml;base64,' + base64Svg

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;background:transparent;">
        <canvas id="c" width="1024" height="1024"></canvas>
        <script>
          const img = new Image();
          img.onload = () => {
            const canvas = document.getElementById('c');
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 1024, 1024);
            window.__done = canvas.toDataURL('image/png');
          };
          img.src = '${dataUri}';
        </script>
      </body>
    </html>
  `

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

  let dataUrl
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100))
    dataUrl = await win.webContents.executeJavaScript('window.__done')
    if (dataUrl) break
  }

  if (!dataUrl) {
    console.error('Failed to get dataUrl from canvas')
    app.exit(1)
    return
  }

  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')
  fs.writeFileSync(
    path.resolve(__dirname, '../build/icon-1024.png'),
    Buffer.from(base64Data, 'base64')
  )
  console.log('Successfully saved build/icon-1024.png')

  app.quit()
})
