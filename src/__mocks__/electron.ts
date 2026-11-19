import os from 'os'
import path from 'path'
import fs from 'fs'

const tmpDir = path.join(os.tmpdir(), 'focus-test-' + process.pid)
fs.mkdirSync(tmpDir, { recursive: true })

export const app = {
  isPackaged: true,
  getPath: (name: string) => {
    if (name === 'userData') return process.env.FOCUS_TEST_USER_DATA || tmpDir
    if (name === 'exe') return '/mock/focus.exe'
    return tmpDir
  },
  getName: () => 'focus-test',
  getVersion: () => '1.0.0-test',
  setLoginItemSettings: () => {},
  quit: () => {},
  focus: () => {}
}

type ListenerFn = (...args: any[]) => any
type HandlerFn = (event: any, ...args: any[]) => any

const ipcListeners = new Map<string, Set<ListenerFn>>()
const ipcHandlers = new Map<string, HandlerFn>()

let currentSenderWindow: any = null

export function setMockSenderWindow(win: any): void {
  currentSenderWindow = win
}

export const ipcMain = {
  handle: (channel: string, handler: HandlerFn) => {
    ipcHandlers.set(channel, handler)
  },
  removeHandler: (channel: string) => {
    ipcHandlers.delete(channel)
  },
  on: (event: string, cb: ListenerFn) => {
    if (!ipcListeners.has(event)) {
      ipcListeners.set(event, new Set())
    }
    ipcListeners.get(event)!.add(cb)
  },
  removeListener: (event: string, cb: ListenerFn) => {
    ipcListeners.get(event)?.delete(cb)
  },
  removeAllListeners: (event?: string) => {
    if (event) {
      ipcListeners.delete(event)
    } else {
      ipcListeners.clear()
      ipcHandlers.clear()
    }
  },
  emit: (event: string, ...args: any[]) => {
    ipcListeners.get(event)?.forEach((cb) => cb(...args))
  }
}

export const ipcRenderer = {
  invoke: async (channel: string, ...args: any[]) => {
    const handler = ipcHandlers.get(channel)
    if (!handler) {
      throw new Error(`No handler registered for '${channel}'`)
    }
    const win = currentSenderWindow || BrowserWindow.instances[0] || null
    const event = {
      sender: win?.webContents || { id: 1, isDestroyed: () => false },
      senderFrame: win?.webContents?.mainFrame || {}
    }
    return await handler(event, ...args)
  },
  send: (channel: string, ...args: any[]) => {
    const listeners = ipcListeners.get(channel)
    if (!listeners) return
    const win = currentSenderWindow || BrowserWindow.instances[0] || null
    const event = {
      sender: win?.webContents || { id: 1, isDestroyed: () => false },
      senderFrame: win?.webContents?.mainFrame || {}
    }
    listeners.forEach((cb) => cb(event, ...args))
  },
  on: (event: string, cb: ListenerFn) => {
    if (!ipcListeners.has(event)) {
      ipcListeners.set(event, new Set())
    }
    ipcListeners.get(event)!.add(cb)
  },
  removeListener: (event: string, cb: ListenerFn) => {
    ipcListeners.get(event)?.delete(cb)
  },
  removeAllListeners: (event?: string) => {
    if (event) {
      ipcListeners.delete(event)
    } else {
      ipcListeners.clear()
    }
  },
  emit: (event: string, ...args: any[]) => {
    ipcListeners.get(event)?.forEach((cb) => cb(...args))
  }
}

export const contextBridge = {
  exposeInMainWorld: () => {}
}

export const shell = {
  openExternal: () => Promise.resolve(),
  showItemInFolder: () => {},
  trashItem: () => Promise.resolve()
}

const powerListeners = new Map<string, Set<ListenerFn>>()

export const powerMonitor = {
  on: (event: string, cb: ListenerFn) => {
    if (!powerListeners.has(event)) {
      powerListeners.set(event, new Set())
    }
    powerListeners.get(event)!.add(cb)
  },
  removeListener: (event: string, cb: ListenerFn) => {
    powerListeners.get(event)?.delete(cb)
  },
  removeAllListeners: (event?: string) => {
    if (event) {
      powerListeners.delete(event)
    } else {
      powerListeners.clear()
    }
  },
  emit: (event: string, ...args: any[]) => {
    powerListeners.get(event)?.forEach((cb) => cb(...args))
  },
  getSystemIdleState: () => 'active',
  getSystemIdleTime: () => 0
}

export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (s: string) => Buffer.from(s),
  decryptString: (b: Buffer) => b.toString()
}

let nextWinId = 1

export const BrowserWindow = class {
  static instances: any[] = []
  static getAllWindows() {
    return [...BrowserWindow.instances]
  }
  static fromWebContents(webContents: any) {
    if (!webContents) return null
    return (
      BrowserWindow.instances.find(
        (w) => w.webContents === webContents || w.webContents?.id === webContents?.id
      ) || null
    )
  }

  id: number
  bounds = { x: 0, y: 0, width: 400, height: 500 }
  _visible = false
  _destroyed = false
  _listeners: Record<string, ListenerFn[]> = {}
  webContents: any

  constructor(opts?: any) {
    if (opts) {
      if (typeof opts.x === 'number') this.bounds.x = opts.x
      if (typeof opts.y === 'number') this.bounds.y = opts.y
      if (typeof opts.width === 'number') this.bounds.width = opts.width
      if (typeof opts.height === 'number') this.bounds.height = opts.height
    }
    this.id = nextWinId++
    const mainFrame = {}
    this.webContents = {
      id: this.id,
      mainFrame,
      send: (channel: string, ...args: any[]) => {
        ipcRenderer.emit(channel, {}, ...args)
      },
      focus: () => {},
      isLoading: () => false,
      once: (_e: string, cb: () => void) => cb(),
      on: () => {},
      removeListener: () => {},
      removeAllListeners: () => {},
      setWindowOpenHandler: () => {},
      isDestroyed: () => this._destroyed
    }
    BrowserWindow.instances.push(this)
  }
  isDestroyed() {
    return this._destroyed
  }
  destroy() {
    this._destroyed = true
    BrowserWindow.instances = BrowserWindow.instances.filter((w) => w !== this)
    this.emit('closed')
  }
  isVisible() {
    return this._visible
  }
  isFocused() {
    return false
  }
  isMinimized() {
    return false
  }
  restore() {}
  setAlwaysOnTop() {}
  setVisibleOnAllWorkspaces() {}
  show() {
    this._visible = true
  }
  showInactive() {
    this._visible = true
  }
  hide() {
    this._visible = false
  }
  focus() {}
  moveTop() {}
  getBounds() {
    return { ...this.bounds }
  }
  setBounds(b: any) {
    this.bounds = { ...this.bounds, ...b }
  }
  getPosition() {
    return [this.bounds.x, this.bounds.y]
  }
  setPosition(x: number, y: number) {
    this.bounds.x = x
    this.bounds.y = y
  }
  loadURL() {
    return Promise.resolve()
  }
  loadFile() {
    return Promise.resolve()
  }
  on(event: string, cb: ListenerFn) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(cb)
    return this
  }
  once(event: string, cb: ListenerFn) {
    const wrapped = (...args: any[]) => {
      this.removeListener(event, wrapped)
      cb(...args)
    }
    return this.on(event, wrapped)
  }
  removeListener(event: string, cb: ListenerFn) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter((fn) => fn !== cb)
    }
    return this
  }
  emit(event: string, ...args: any[]) {
    const list = [...(this._listeners[event] || [])]
    list.forEach((cb) => cb(...args))
  }
}

export const screen = {
  getPrimaryDisplay: () => ({
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    workAreaSize: { width: 1920, height: 1040 },
    scaleFactor: 1.0
  }),
  getAllDisplays: () => [
    {
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      workAreaSize: { width: 1920, height: 1040 },
      scaleFactor: 1.0
    }
  ],
  getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  getDisplayNearestPoint: () => ({
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    workAreaSize: { width: 1920, height: 1040 },
    scaleFactor: 1.0
  }),
  on: () => {}
}

export const nativeImage = {
  createFromPath: () => ({})
}

export const Tray = class {
  setToolTip() {}
  setContextMenu() {}
  setImage() {}
  setTitle() {}
  destroy() {}
  isDestroyed() {
    return false
  }
  on() {}
}

export const Notification = class {
  static isSupported() {
    return true
  }

  title: string
  body: string
  _listeners: Record<string, ListenerFn[]> = {}

  constructor(options: { title?: string; body?: string } = {}) {
    this.title = options.title || ''
    this.body = options.body || ''
  }

  show() {}
  close() {}

  on(event: string, cb: ListenerFn) {
    if (!this._listeners[event]) {
      this._listeners[event] = []
    }
    this._listeners[event].push(cb)
  }

  emit(event: string, ...args: any[]) {
    this._listeners[event]?.forEach((cb) => cb(...args))
  }
}

export const Menu = {
  buildFromTemplate: () => ({})
}

export default {
  app,
  ipcMain,
  ipcRenderer,
  contextBridge,
  shell,
  powerMonitor,
  safeStorage,
  BrowserWindow,
  screen,
  nativeImage,
  Tray,
  Menu,
  Notification
}
