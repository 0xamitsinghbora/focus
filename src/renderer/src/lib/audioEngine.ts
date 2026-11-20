import { useSyncExternalStore } from 'react'

import wavesAudioUrl from '../assets/sounds/waves.mp3'
import rainAudioUrl from '../assets/sounds/rain.mp3'
import windAudioUrl from '../assets/sounds/wind.mp3'
import streamAudioUrl from '../assets/sounds/stream.mp3'
import groveAudioUrl from '../assets/sounds/grove.mp3'
import spaceAudioUrl from '../assets/sounds/space.mp3'
import whiteNoiseAudioUrl from '../assets/sounds/white-noise.mp3'
import cityTokyoAudioUrl from '../assets/sounds/city-tokyo.mp3'
import cityLondonAudioUrl from '../assets/sounds/city-london.mp3'
import cityReykjavikAudioUrl from '../assets/sounds/city-reykjavik.mp3'

export type NoiseType =
  | 'cocoon'
  | 'rain'
  | 'stream'
  | 'deep'
  | 'waves'
  | 'wind'
  | 'white-noise'
  | 'city-tokyo'
  | 'city-london'
  | 'city-reykjavik'
  | 'custom'

const SR = 44100
const BUF_SEC = 4

const bufferCache = new WeakMap<AudioContext, Map<(d: Float32Array) => void, AudioBuffer>>()

export function fillBrown(d: Float32Array): void {
  const len = d.length
  const fadeLen = Math.min(2048, Math.floor(len / 4))
  const total = len + fadeLen
  const raw = new Float32Array(total)

  let last = 0
  for (let i = 0; i < total; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    raw[i] = last * 3.5
  }

  // Seamless loop crossfade: blend wrap-around tail into head using equal-power curve
  for (let i = 0; i < fadeLen; i++) {
    const alpha = i / fadeLen
    const gainHead = Math.sin(alpha * 0.5 * Math.PI)
    const gainTail = Math.cos(alpha * 0.5 * Math.PI)
    d[i] = raw[i] * gainHead + raw[len + i] * gainTail
  }
  for (let i = fadeLen; i < len; i++) {
    d[i] = raw[i]
  }
}

export function fillPink(d: Float32Array): void {
  const len = d.length
  const fadeLen = Math.min(2048, Math.floor(len / 4))
  const total = len + fadeLen
  const raw = new Float32Array(total)

  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0
  for (let i = 0; i < total; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }

  // Seamless loop crossfade: blend wrap-around tail into head using equal-power curve
  for (let i = 0; i < fadeLen; i++) {
    const alpha = i / fadeLen
    const gainHead = Math.sin(alpha * 0.5 * Math.PI)
    const gainTail = Math.cos(alpha * 0.5 * Math.PI)
    d[i] = raw[i] * gainHead + raw[len + i] * gainTail
  }
  for (let i = fadeLen; i < len; i++) {
    d[i] = raw[i]
  }
}

function fillWhite(d: Float32Array): void {
  const len = d.length
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * 0.45
  }
}

let prewarmedBrown0: Float32Array | null = null
let prewarmedBrown1: Float32Array | null = null
let prewarmedPink0: Float32Array | null = null
let prewarmedPink1: Float32Array | null = null
let prewarmedWhite0: Float32Array | null = null
let prewarmedWhite1: Float32Array | null = null

function prewarmNoiseGenerators(): void {
  if (typeof window === 'undefined') return
  const schedule =
    typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 100)

  schedule(() => {
    try {
      const len = SR * BUF_SEC
      if (!prewarmedBrown0) {
        prewarmedBrown0 = new Float32Array(len)
        fillBrown(prewarmedBrown0)
      }
      if (!prewarmedBrown1) {
        prewarmedBrown1 = new Float32Array(len)
        fillBrown(prewarmedBrown1)
      }
      if (!prewarmedPink0) {
        prewarmedPink0 = new Float32Array(len)
        fillPink(prewarmedPink0)
      }
      if (!prewarmedPink1) {
        prewarmedPink1 = new Float32Array(len)
        fillPink(prewarmedPink1)
      }
      if (!prewarmedWhite0) {
        prewarmedWhite0 = new Float32Array(len)
        fillWhite(prewarmedWhite0)
      }
      if (!prewarmedWhite1) {
        prewarmedWhite1 = new Float32Array(len)
        fillWhite(prewarmedWhite1)
      }
    } catch {
      // Audio prewarm ignored in test or constrained environments
    }
  })
}

function resetPrewarmedBuffersForTesting(): void {
  prewarmedBrown0 = null
  prewarmedBrown1 = null
  prewarmedPink0 = null
  prewarmedPink1 = null
  prewarmedWhite0 = null
  prewarmedWhite1 = null
}

function noiseBuf(ctx: AudioContext, fill: (d: Float32Array) => void): AudioBuffer {
  let ctxMap = bufferCache.get(ctx)
  if (!ctxMap) {
    ctxMap = new Map()
    bufferCache.set(ctx, ctxMap)
  }
  let buf = ctxMap.get(fill)
  if (!buf) {
    const len = SR * BUF_SEC
    buf = ctx.createBuffer(2, len, SR)
    if (fill === fillBrown && prewarmedBrown0 && prewarmedBrown1) {
      buf.getChannelData(0).set(prewarmedBrown0)
      buf.getChannelData(1).set(prewarmedBrown1)
      prewarmedBrown0 = null
      prewarmedBrown1 = null
    } else if (fill === fillPink && prewarmedPink0 && prewarmedPink1) {
      buf.getChannelData(0).set(prewarmedPink0)
      buf.getChannelData(1).set(prewarmedPink1)
      prewarmedPink0 = null
      prewarmedPink1 = null
    } else if (fill === fillWhite && prewarmedWhite0 && prewarmedWhite1) {
      buf.getChannelData(0).set(prewarmedWhite0)
      buf.getChannelData(1).set(prewarmedWhite1)
      prewarmedWhite0 = null
      prewarmedWhite1 = null
    } else {
      fill(buf.getChannelData(0))
      fill(buf.getChannelData(1))
    }
    ctxMap.set(fill, buf)
  }
  return buf
}

type Cleanup = { stop(): void }

function loopNoise(ctx: AudioContext, fill: (d: Float32Array) => void, dest: AudioNode): Cleanup {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf(ctx, fill)
  src.loop = true
  src.connect(dest)
  src.start()
  return {
    stop: () => {
      try {
        src.stop()
        src.disconnect()
      } catch {
        /**/
      }
    }
  }
}

function lfo(ctx: AudioContext, freq: number, depth: number, target: AudioParam): Cleanup {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq
  const g = ctx.createGain()
  g.gain.value = depth
  osc.connect(g)
  g.connect(target)
  osc.start()
  return {
    stop: () => {
      try {
        osc.stop()
        osc.disconnect()
        g.disconnect()
      } catch {
        /**/
      }
    }
  }
}

function drone(ctx: AudioContext, freq: number, type: OscillatorType, dest: AudioNode): Cleanup {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(dest)
  osc.start()
  return {
    stop: () => {
      try {
        osc.stop()
        osc.disconnect()
      } catch {
        /**/
      }
    }
  }
}

function trackNode<T extends AudioNode>(node: T, parts: Cleanup[]): T {
  parts.push({
    stop: () => {
      try {
        node.disconnect()
      } catch {
        /**/
      }
    }
  })
  return node
}

interface PresetBuilder {
  (ctx: AudioContext, master: GainNode): Cleanup[]
}

const buildCocoon: PresetBuilder = (ctx, master) => {
  const parts: Cleanup[] = []

  const droneGain = trackNode(ctx.createGain(), parts)
  droneGain.gain.value = 0.4
  const droneLp = trackNode(ctx.createBiquadFilter(), parts)
  droneLp.type = 'lowpass'
  droneLp.frequency.value = 500
  droneLp.Q.value = 0.5
  droneGain.connect(droneLp)
  droneLp.connect(master)

  parts.push(drone(ctx, 110, 'sine', droneGain))
  parts.push(drone(ctx, 110.3, 'sine', droneGain))
  parts.push(drone(ctx, 164.8, 'sine', droneGain))
  parts.push(drone(ctx, 165.2, 'sine', droneGain))
  parts.push(drone(ctx, 220, 'sine', droneGain))
  parts.push(drone(ctx, 220.5, 'sine', droneGain))

  parts.push(lfo(ctx, 0.08, 0.08, droneGain.gain))

  const noiseGain = trackNode(ctx.createGain(), parts)
  noiseGain.gain.value = 0.3
  const noiseLp = trackNode(ctx.createBiquadFilter(), parts)
  noiseLp.type = 'lowpass'
  noiseLp.frequency.value = 800
  noiseLp.Q.value = 0.3
  noiseGain.connect(noiseLp)
  noiseLp.connect(master)
  parts.push(loopNoise(ctx, fillBrown, noiseGain))
  parts.push(lfo(ctx, 0.05, 200, noiseLp.frequency))

  return parts
}

const buildRain: PresetBuilder = (ctx, master) => {
  const parts: Cleanup[] = []

  const lowGain = trackNode(ctx.createGain(), parts)
  lowGain.gain.value = 0.5
  const lowLp = trackNode(ctx.createBiquadFilter(), parts)
  lowLp.type = 'lowpass'
  lowLp.frequency.value = 400
  lowLp.Q.value = 0.4
  lowGain.connect(lowLp)
  lowLp.connect(master)
  parts.push(loopNoise(ctx, fillBrown, lowGain))
  parts.push(lfo(ctx, 0.04, 0.1, lowGain.gain))

  const midGain = trackNode(ctx.createGain(), parts)
  midGain.gain.value = 0.45
  const midBp = trackNode(ctx.createBiquadFilter(), parts)
  midBp.type = 'bandpass'
  midBp.frequency.value = 1000
  midBp.Q.value = 0.3
  midGain.connect(midBp)
  midBp.connect(master)
  parts.push(loopNoise(ctx, fillPink, midGain))
  parts.push(lfo(ctx, 0.07, 300, midBp.frequency))
  parts.push(lfo(ctx, 0.12, 0.1, midGain.gain))

  const hiGain = trackNode(ctx.createGain(), parts)
  hiGain.gain.value = 0.15
  const hiBp = trackNode(ctx.createBiquadFilter(), parts)
  hiBp.type = 'bandpass'
  hiBp.frequency.value = 2800
  hiBp.Q.value = 0.5
  const hiLp = trackNode(ctx.createBiquadFilter(), parts)
  hiLp.type = 'lowpass'
  hiLp.frequency.value = 4500
  hiLp.Q.value = 0.5
  hiGain.connect(hiBp)
  hiBp.connect(hiLp)
  hiLp.connect(master)
  parts.push(loopNoise(ctx, fillPink, hiGain))
  parts.push(lfo(ctx, 0.09, 0.04, hiGain.gain))

  return parts
}

const buildStream: PresetBuilder = (ctx, master) => {
  const parts: Cleanup[] = []

  const lowGain = trackNode(ctx.createGain(), parts)
  lowGain.gain.value = 0.45
  const lowLp = trackNode(ctx.createBiquadFilter(), parts)
  lowLp.type = 'lowpass'
  lowLp.frequency.value = 500
  lowLp.Q.value = 0.4
  lowGain.connect(lowLp)
  lowLp.connect(master)
  parts.push(loopNoise(ctx, fillBrown, lowGain))

  const midGain = trackNode(ctx.createGain(), parts)
  midGain.gain.value = 0.5
  const midBp = trackNode(ctx.createBiquadFilter(), parts)
  midBp.type = 'bandpass'
  midBp.frequency.value = 700
  midBp.Q.value = 0.25
  midGain.connect(midBp)
  midBp.connect(master)
  parts.push(loopNoise(ctx, fillPink, midGain))
  parts.push(lfo(ctx, 0.06, 250, midBp.frequency))
  parts.push(lfo(ctx, 0.1, 0.12, midGain.gain))

  const hiGain = trackNode(ctx.createGain(), parts)
  hiGain.gain.value = 0.2
  const hiBp = trackNode(ctx.createBiquadFilter(), parts)
  hiBp.type = 'bandpass'
  hiBp.frequency.value = 2200
  hiBp.Q.value = 0.4
  const hiLp = trackNode(ctx.createBiquadFilter(), parts)
  hiLp.type = 'lowpass'
  hiLp.frequency.value = 4000
  hiLp.Q.value = 0.5
  hiGain.connect(hiBp)
  hiBp.connect(hiLp)
  hiLp.connect(master)
  parts.push(loopNoise(ctx, fillPink, hiGain))
  parts.push(lfo(ctx, 0.15, 0.05, hiGain.gain))
  parts.push(lfo(ctx, 0.08, 400, hiBp.frequency))

  const droneG = trackNode(ctx.createGain(), parts)
  droneG.gain.value = 0.15
  const droneLp = trackNode(ctx.createBiquadFilter(), parts)
  droneLp.type = 'lowpass'
  droneLp.frequency.value = 300
  droneG.connect(droneLp)
  droneLp.connect(master)
  parts.push(drone(ctx, 82, 'sine', droneG))
  parts.push(drone(ctx, 82.4, 'sine', droneG))
  parts.push(lfo(ctx, 0.06, 0.04, droneG.gain))

  return parts
}

const buildDeep: PresetBuilder = (ctx, master) => {
  const parts: Cleanup[] = []

  // drone at audible range — A2/E3 with beating
  const droneGain = trackNode(ctx.createGain(), parts)
  droneGain.gain.value = 0.45
  const droneLp = trackNode(ctx.createBiquadFilter(), parts)
  droneLp.type = 'lowpass'
  droneLp.frequency.value = 350
  droneLp.Q.value = 0.4
  droneGain.connect(droneLp)
  droneLp.connect(master)
  parts.push(drone(ctx, 110, 'sine', droneGain))
  parts.push(drone(ctx, 110.2, 'sine', droneGain))
  parts.push(drone(ctx, 82.4, 'sine', droneGain))
  parts.push(drone(ctx, 82.6, 'sine', droneGain))
  parts.push(drone(ctx, 165, 'sine', droneGain))
  parts.push(drone(ctx, 165.3, 'sine', droneGain))
  parts.push(lfo(ctx, 0.04, 0.1, droneGain.gain))

  // brown noise rumble
  const noiseGain = trackNode(ctx.createGain(), parts)
  noiseGain.gain.value = 0.45
  const noiseLp = trackNode(ctx.createBiquadFilter(), parts)
  noiseLp.type = 'lowpass'
  noiseLp.frequency.value = 500
  noiseLp.Q.value = 0.3
  noiseGain.connect(noiseLp)
  noiseLp.connect(master)
  parts.push(loopNoise(ctx, fillBrown, noiseGain))
  parts.push(lfo(ctx, 0.03, 100, noiseLp.frequency))
  parts.push(lfo(ctx, 0.05, 0.1, noiseGain.gain))

  return parts
}

// --------------------------------------------------------------------------
// Calibrated Nature & City Soundscapes
// --------------------------------------------------------------------------

const buildWaves: PresetBuilder = (ctx, master) => {
  const parts: Cleanup[] = []

  // 1. Oceanic Swell: low-frequency brown noise with rolling 0.08Hz lowpass surge
  const swellGain = trackNode(ctx.createGain(), parts)
  swellGain.gain.value = 0.4
  const swellFilter = trackNode(ctx.createBiquadFilter(), parts)
  swellFilter.type = 'lowpass'
  swellFilter.frequency.value = 260
  swellFilter.Q.value = 0.8
  swellGain.connect(swellFilter)
  swellFilter.connect(master)
  parts.push(loopNoise(ctx, fillBrown, swellGain))
  parts.push(lfo(ctx, 0.08, 160, swellFilter.frequency))
  parts.push(lfo(ctx, 0.08, 0.18, swellGain.gain))

  // 2. Wave Crest & Surf Foam: pink noise bandpass that swells with the break
  const crestGain = trackNode(ctx.createGain(), parts)
  crestGain.gain.value = 0.28
  const crestFilter = trackNode(ctx.createBiquadFilter(), parts)
  crestFilter.type = 'bandpass'
  crestFilter.frequency.value = 1100
  crestFilter.Q.value = 0.6
  crestGain.connect(crestFilter)
  crestFilter.connect(master)
  parts.push(loopNoise(ctx, fillPink, crestGain))
  parts.push(lfo(ctx, 0.08, 400, crestFilter.frequency))
  parts.push(lfo(ctx, 0.08, 0.14, crestGain.gain))

  // 3. Shore Spray & Fizz: gentle high-passed white noise for receding foam
  const sprayGain = trackNode(ctx.createGain(), parts)
  sprayGain.gain.value = 0.12
  const sprayFilter = trackNode(ctx.createBiquadFilter(), parts)
  sprayFilter.type = 'highpass'
  sprayFilter.frequency.value = 2800
  sprayGain.connect(sprayFilter)
  sprayFilter.connect(master)
  parts.push(loopNoise(ctx, fillWhite, sprayGain))
  parts.push(lfo(ctx, 0.08, 0.08, sprayGain.gain))

  // 4. Sub-oceanic Resonance: grounding 55Hz (A1) deep sea drone
  const subGain = trackNode(ctx.createGain(), parts)
  subGain.gain.value = 0.2
  const subLp = trackNode(ctx.createBiquadFilter(), parts)
  subLp.type = 'lowpass'
  subLp.frequency.value = 120
  subGain.connect(subLp)
  subLp.connect(master)
  parts.push(drone(ctx, 55, 'sine', subGain))
  parts.push(drone(ctx, 55.3, 'sine', subGain))
  parts.push(lfo(ctx, 0.04, 0.06, subGain.gain))

  return parts
}

const buildWind: PresetBuilder = (ctx, master) => {
  const parts: Cleanup[] = []

  // 1. Mountain Breeze Body: pink noise through sweeping resonant bandpass
  const breezeGain = trackNode(ctx.createGain(), parts)
  breezeGain.gain.value = 0.42
  const breezeBp = trackNode(ctx.createBiquadFilter(), parts)
  breezeBp.type = 'bandpass'
  breezeBp.frequency.value = 450
  breezeBp.Q.value = 2.2
  breezeGain.connect(breezeBp)
  breezeBp.connect(master)
  parts.push(loopNoise(ctx, fillPink, breezeGain))
  parts.push(lfo(ctx, 0.04, 200, breezeBp.frequency))
  parts.push(lfo(ctx, 0.04, 0.15, breezeGain.gain))

  // 2. High Whistling Gusts: airy high-Q bandpass with desynchronized cycle
  const gustGain = trackNode(ctx.createGain(), parts)
  gustGain.gain.value = 0.22
  const gustBp = trackNode(ctx.createBiquadFilter(), parts)
  gustBp.type = 'bandpass'
  gustBp.frequency.value = 1100
  gustBp.Q.value = 3.2
  gustGain.connect(gustBp)
  gustBp.connect(master)
  parts.push(loopNoise(ctx, fillPink, gustGain))
  parts.push(lfo(ctx, 0.065, 450, gustBp.frequency))
  parts.push(lfo(ctx, 0.065, 0.1, gustGain.gain))

  // 3. Atmospheric Sub-rumble: deep lowpass brown noise
  const pressureGain = trackNode(ctx.createGain(), parts)
  pressureGain.gain.value = 0.35
  const pressureLp = trackNode(ctx.createBiquadFilter(), parts)
  pressureLp.type = 'lowpass'
  pressureLp.frequency.value = 220
  pressureGain.connect(pressureLp)
  pressureLp.connect(master)
  parts.push(loopNoise(ctx, fillBrown, pressureGain))
  parts.push(lfo(ctx, 0.03, 0.08, pressureGain.gain))

  // 4. Canopy Leaf & Pine Rustle
  const rustleGain = trackNode(ctx.createGain(), parts)
  rustleGain.gain.value = 0.08
  const rustleHp = trackNode(ctx.createBiquadFilter(), parts)
  rustleHp.type = 'highpass'
  rustleHp.frequency.value = 3500
  rustleGain.connect(rustleHp)
  rustleHp.connect(master)
  parts.push(loopNoise(ctx, fillWhite, rustleGain))
  parts.push(lfo(ctx, 0.12, 0.04, rustleGain.gain))

  return parts
}

const buildWhiteNoise: PresetBuilder = (ctx, master) => {
  const parts: Cleanup[] = []

  // Full-spectrum focus masking: crisp white noise with smooth high-cut & sub-cut
  const noiseGain = trackNode(ctx.createGain(), parts)
  noiseGain.gain.value = 0.4

  const lpFilter = trackNode(ctx.createBiquadFilter(), parts)
  lpFilter.type = 'lowpass'
  lpFilter.frequency.value = 7500
  lpFilter.Q.value = 0.5

  const hpFilter = trackNode(ctx.createBiquadFilter(), parts)
  hpFilter.type = 'highpass'
  hpFilter.frequency.value = 80
  hpFilter.Q.value = 0.5

  noiseGain.connect(lpFilter)
  lpFilter.connect(hpFilter)
  hpFilter.connect(master)

  parts.push(loopNoise(ctx, fillWhite, noiseGain))
  parts.push(lfo(ctx, 0.03, 0.03, noiseGain.gain))

  return parts
}

const buildCityTokyo: PresetBuilder = (ctx, master) => {
  const parts: Cleanup[] = []

  // 1. Meditative Shakuhachi Flute Drones (Japanese In-scale: D3 146.8Hz & A3 220Hz)
  const fluteGain = trackNode(ctx.createGain(), parts)
  fluteGain.gain.value = 0.28
  const fluteLp = trackNode(ctx.createBiquadFilter(), parts)
  fluteLp.type = 'lowpass'
  fluteLp.frequency.value = 450
  fluteGain.connect(fluteLp)
  fluteLp.connect(master)
  parts.push(drone(ctx, 146.83, 'sine', fluteGain))
  parts.push(drone(ctx, 220.0, 'sine', fluteGain))
  parts.push(drone(ctx, 293.66, 'sine', fluteGain))
  parts.push(lfo(ctx, 0.04, 0.08, fluteGain.gain))

  // 2. Temple bronze singing bowl / Kansho bell resonance (587Hz D5 & 880Hz A5)
  const bellGain = trackNode(ctx.createGain(), parts)
  bellGain.gain.value = 0.16
  const bellBp = trackNode(ctx.createBiquadFilter(), parts)
  bellBp.type = 'bandpass'
  bellBp.frequency.value = 750
  bellBp.Q.value = 1.6
  bellGain.connect(bellBp)
  bellBp.connect(master)
  parts.push(drone(ctx, 587.33, 'sine', bellGain))
  parts.push(drone(ctx, 880.0, 'sine', bellGain))
  parts.push(lfo(ctx, 0.03, 0.09, bellGain.gain))

  return parts
}

const buildCityLondon: PresetBuilder = (ctx, master) => {
  const parts: Cleanup[] = []

  // 1. Warm bowed cello open fifths (C2 65.4Hz, G2 98.0Hz, C3 130.8Hz, E3 164.8Hz)
  const celloGain = trackNode(ctx.createGain(), parts)
  celloGain.gain.value = 0.32
  const celloLp = trackNode(ctx.createBiquadFilter(), parts)
  celloLp.type = 'lowpass'
  celloLp.frequency.value = 350
  celloGain.connect(celloLp)
  celloLp.connect(master)
  parts.push(drone(ctx, 65.41, 'sine', celloGain))
  parts.push(drone(ctx, 98.0, 'sine', celloGain))
  parts.push(drone(ctx, 130.81, 'sine', celloGain))
  parts.push(drone(ctx, 164.81, 'sine', celloGain))
  parts.push(lfo(ctx, 0.05, 0.1, celloGain.gain))

  // 2. Westminster clock tower chime resonance (164.8Hz & 246.9Hz mellow overtones)
  const bellGain = trackNode(ctx.createGain(), parts)
  bellGain.gain.value = 0.18
  const bellFilter = trackNode(ctx.createBiquadFilter(), parts)
  bellFilter.type = 'bandpass'
  bellFilter.frequency.value = 220
  bellFilter.Q.value = 1.8
  bellGain.connect(bellFilter)
  bellFilter.connect(master)
  parts.push(drone(ctx, 164.8, 'sine', bellGain))
  parts.push(drone(ctx, 246.9, 'sine', bellGain))
  parts.push(lfo(ctx, 0.025, 0.09, bellGain.gain))

  return parts
}

const buildCityReykjavik: PresetBuilder = (ctx, master) => {
  const parts: Cleanup[] = []

  // 1. Clean Arctic coastal wind sweeping the harbor
  const arcticWindGain = trackNode(ctx.createGain(), parts)
  arcticWindGain.gain.value = 0.35
  const arcticBp = trackNode(ctx.createBiquadFilter(), parts)
  arcticBp.type = 'bandpass'
  arcticBp.frequency.value = 650
  arcticBp.Q.value = 2.4
  arcticWindGain.connect(arcticBp)
  arcticBp.connect(master)
  parts.push(loopNoise(ctx, fillPink, arcticWindGain))
  parts.push(lfo(ctx, 0.03, 220, arcticBp.frequency))
  parts.push(lfo(ctx, 0.03, 0.12, arcticWindGain.gain))

  // 2. Harpa concert hall glass organ resonance (open fifths D3 - A3 - D4)
  const padGain = trackNode(ctx.createGain(), parts)
  padGain.gain.value = 0.22
  const padLp = trackNode(ctx.createBiquadFilter(), parts)
  padLp.type = 'lowpass'
  padLp.frequency.value = 600
  padGain.connect(padLp)
  padLp.connect(master)
  parts.push(drone(ctx, 146.83, 'sine', padGain))
  parts.push(drone(ctx, 220.0, 'sine', padGain))
  parts.push(drone(ctx, 293.66, 'sine', padGain))
  parts.push(lfo(ctx, 0.04, 0.09, padGain.gain))

  // 3. Geothermal steam & gentle harbor water
  const steamGain = trackNode(ctx.createGain(), parts)
  steamGain.gain.value = 0.14
  const steamBp = trackNode(ctx.createBiquadFilter(), parts)
  steamBp.type = 'bandpass'
  steamBp.frequency.value = 2200
  steamBp.Q.value = 0.5
  steamGain.connect(steamBp)
  steamBp.connect(master)
  parts.push(loopNoise(ctx, fillWhite, steamGain))
  parts.push(lfo(ctx, 0.05, 0.05, steamGain.gain))

  return parts
}

// --------------------------------------------------------------------------
// 3D Spatial Audio Stage
// --------------------------------------------------------------------------

interface SpatialStage {
  input: GainNode
  output: AudioNode
  cleanup: Cleanup
}

function createSpatialStage(ctx: AudioContext, dest: AudioNode): SpatialStage {
  const input = ctx.createGain()
  const parts: Cleanup[] = []

  let stageTail: AudioNode = input

  // 1. Acoustic Smoothing & Warmth (eliminates harsh high-frequency clock/static hiss)
  if (typeof ctx.createBiquadFilter === 'function') {
    try {
      const smoothingShelf = ctx.createBiquadFilter()
      smoothingShelf.type = 'highshelf'
      smoothingShelf.frequency.value = 6000
      smoothingShelf.gain.value = -2.5 // Smooths out harsh static and mic hiss
      stageTail.connect(smoothingShelf)
      stageTail = smoothingShelf
      parts.push({
        stop: () => {
          try {
            smoothingShelf.disconnect()
          } catch {
            /* ignore */
          }
        }
      })

      const warmthShelf = ctx.createBiquadFilter()
      warmthShelf.type = 'lowshelf'
      warmthShelf.frequency.value = 160
      warmthShelf.gain.value = 1.0 // Adds deep, soothing organic body
      stageTail.connect(warmthShelf)
      stageTail = warmthShelf
      parts.push({
        stop: () => {
          try {
            warmthShelf.disconnect()
          } catch {
            /* ignore */
          }
        }
      })
    } catch {
      // fallback
    }
  }

  // 2. Subtle Binaural Spatial Orbit (Gentle stereo breathing with NO phase cancellation or comb filtering)
  if (typeof ctx.createStereoPanner === 'function') {
    try {
      const panner = ctx.createStereoPanner()
      panner.pan.value = 0
      stageTail.connect(panner)
      stageTail = panner

      parts.push(lfo(ctx, 0.02, 0.06, panner.pan))
      parts.push({
        stop: () => {
          try {
            panner.disconnect()
          } catch {
            /* ignore */
          }
        }
      })
    } catch {
      // fallback
    }
  }

  stageTail.connect(dest)

  return {
    input,
    output: stageTail,
    cleanup: {
      stop: () => {
        for (const p of parts) {
          p.stop()
        }
        try {
          input.disconnect()
        } catch {
          /* ignore */
        }
      }
    }
  }
}

const SOUND_URLS: Partial<Record<NoiseType, string>> = {
  waves: wavesAudioUrl,
  rain: rainAudioUrl,
  wind: windAudioUrl,
  stream: streamAudioUrl,
  cocoon: groveAudioUrl,
  deep: spaceAudioUrl,
  'white-noise': whiteNoiseAudioUrl,
  'city-tokyo': cityTokyoAudioUrl,
  'city-london': cityLondonAudioUrl,
  'city-reykjavik': cityReykjavikAudioUrl
}

const decodedBufferCache = new Map<string, AudioBuffer>()
const pendingDecodes = new Map<string, Promise<AudioBuffer | null>>()

async function loadSoundscapeBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  if (typeof fetch !== 'function' || !url) return null
  const cached = decodedBufferCache.get(url)
  if (cached) return cached

  const pending = pendingDecodes.get(url)
  if (pending) return pending

  const p = (async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const arrayBuf = await res.arrayBuffer()
      if (typeof ctx.decodeAudioData !== 'function') return null
      return await new Promise<AudioBuffer>((resolve, reject) => {
        try {
          const ret = ctx.decodeAudioData(arrayBuf, resolve, reject)
          if (ret && typeof (ret as Promise<AudioBuffer>).then === 'function') {
            ;(ret as Promise<AudioBuffer>).then(resolve).catch(reject)
          }
        } catch (e) {
          reject(e)
        }
      })
    } catch {
      return null
    } finally {
      pendingDecodes.delete(url)
    }
  })()

  pendingDecodes.set(url, p)
  const result = await p
  if (result) {
    decodedBufferCache.set(url, result)
  }
  return result
}

function preloadAllSoundscapes(ctx: AudioContext): void {
  if (typeof fetch !== 'function' || typeof ctx.decodeAudioData !== 'function') return
  for (const url of Object.values(SOUND_URLS)) {
    if (url && !decodedBufferCache.has(url)) {
      loadSoundscapeBuffer(ctx, url).catch(() => {})
    }
  }
}

const FALLBACK_BUILDERS: Record<NoiseType, PresetBuilder> = {
  cocoon: buildCocoon,
  rain: buildRain,
  stream: buildStream,
  deep: buildDeep,
  waves: buildWaves,
  wind: buildWind,
  'white-noise': buildWhiteNoise,
  'city-tokyo': buildCityTokyo,
  'city-london': buildCityLondon,
  'city-reykjavik': buildCityReykjavik,
  custom: buildWaves
}

function buildCustomSoundscape(): PresetBuilder {
  return (ctx: AudioContext, dest: GainNode): Cleanup[] => {
    const active = audioEngine?.activeCustomTrack
    const cached = active?.decoded
    if (cached) {
      try {
        const src = ctx.createBufferSource()
        src.buffer = cached
        src.loop = true
        src.connect(dest)
        src.start(0)
        return [
          {
            stop: () => {
              try {
                src.stop()
                src.disconnect()
              } catch {
                /* ignore */
              }
            }
          }
        ]
      } catch {
        /* fallback to procedural synthesis */
      }
    }

    const raw = active?.buffer
    let activeCleanup: Cleanup[] = []
    let cancelled = false

    if (raw && typeof ctx.decodeAudioData === 'function') {
      new Promise<AudioBuffer>((resolve, reject) => {
        try {
          const ret = ctx.decodeAudioData(raw.slice(0), resolve, reject)
          if (ret && typeof (ret as Promise<AudioBuffer>).then === 'function') {
            ;(ret as Promise<AudioBuffer>).then(resolve).catch(reject)
          }
        } catch (e) {
          reject(e)
        }
      })
        .then((buf) => {
          if (cancelled || !buf) return
          if (active) active.decoded = buf
          for (const c of activeCleanup) c.stop()
          activeCleanup = []
          try {
            const src = ctx.createBufferSource()
            src.buffer = buf
            src.loop = true
            src.connect(dest)
            src.start(0)
            activeCleanup.push({
              stop: () => {
                try {
                  src.stop()
                  src.disconnect()
                } catch {
                  /* ignore */
                }
              }
            })
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          if (!cancelled && activeCleanup.length === 0) {
            activeCleanup = buildWaves(ctx, dest)
          }
        })
    } else {
      activeCleanup = buildWaves(ctx, dest)
    }

    return [
      {
        stop: () => {
          cancelled = true
          for (const c of activeCleanup) c.stop()
        }
      }
    ]
  }
}

function buildSoundscape(type: NoiseType): PresetBuilder {
  return (ctx: AudioContext, dest: GainNode): Cleanup[] => {
    const url = SOUND_URLS[type]
    const cached = url ? decodedBufferCache.get(url) : null

    if (cached) {
      try {
        const src = ctx.createBufferSource()
        src.buffer = cached
        src.loop = true
        src.connect(dest)
        src.start(0)
        return [
          {
            stop: () => {
              try {
                src.stop()
                src.disconnect()
              } catch {
                /* ignore */
              }
            }
          }
        ]
      } catch {
        /* fallback to procedural synthesis */
      }
    }

    let activeCleanup: Cleanup[] = []
    let cancelled = false

    if (url && typeof fetch === 'function' && typeof ctx.decodeAudioData === 'function') {
      loadSoundscapeBuffer(ctx, url)
        .then((buf) => {
          if (cancelled || !buf) return
          for (const c of activeCleanup) c.stop()
          activeCleanup = []
          try {
            const src = ctx.createBufferSource()
            src.buffer = buf
            src.loop = true
            src.connect(dest)
            src.start(0)
            activeCleanup.push({
              stop: () => {
                try {
                  src.stop()
                  src.disconnect()
                } catch {
                  /* ignore */
                }
              }
            })
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          if (!cancelled && activeCleanup.length === 0) {
            const fallback = FALLBACK_BUILDERS[type] || buildWaves
            activeCleanup = fallback(ctx, dest)
          }
        })
    } else {
      const fallback = FALLBACK_BUILDERS[type] || buildWaves
      activeCleanup = fallback(ctx, dest)
    }

    return [
      {
        stop: () => {
          cancelled = true
          for (const c of activeCleanup) c.stop()
        }
      }
    ]
  }
}

const BUILDERS: Record<NoiseType, PresetBuilder> = {
  cocoon: buildSoundscape('cocoon'),
  rain: buildSoundscape('rain'),
  stream: buildSoundscape('stream'),
  deep: buildSoundscape('deep'),
  waves: buildSoundscape('waves'),
  wind: buildSoundscape('wind'),
  'white-noise': buildSoundscape('white-noise'),
  'city-tokyo': buildSoundscape('city-tokyo'),
  'city-london': buildSoundscape('city-london'),
  'city-reykjavik': buildSoundscape('city-reykjavik'),
  custom: buildCustomSoundscape()
}

const ALL_KEYS: NoiseType[] = [
  'cocoon',
  'rain',
  'stream',
  'deep',
  'waves',
  'wind',
  'white-noise',
  'city-tokyo',
  'city-london',
  'city-reykjavik',
  'custom'
]

let inMemoryAudioPrefs: { noiseType: NoiseType; volume: number; spatialAudio: boolean } = {
  noiseType: 'cocoon',
  volume: 0.8,
  spatialAudio: true
}

// Hydrate from SQLite AppSettings if available
if (typeof window !== 'undefined' && window.api?.settings?.get) {
  window.api.settings
    .get()
    .then((settings) => {
      if (settings?.whiteNoisePreference) {
        const pref = settings.whiteNoisePreference
        if (ALL_KEYS.includes(pref.noiseType as NoiseType)) {
          inMemoryAudioPrefs.noiseType = pref.noiseType as NoiseType
        }
        if (typeof pref.volume === 'number' && !isNaN(pref.volume)) {
          inMemoryAudioPrefs.volume = Math.max(0, Math.min(1, pref.volume))
        }
        if (typeof pref.spatialAudio === 'boolean') {
          inMemoryAudioPrefs.spatialAudio = pref.spatialAudio
        }
      }
    })
    .catch(() => {})
}

function loadStoredPrefs(): { noiseType: NoiseType; volume: number; spatialAudio: boolean } {
  return { ...inMemoryAudioPrefs }
}

function saveStoredPrefs(noiseType: NoiseType, volume: number, spatialAudio: boolean): void {
  inMemoryAudioPrefs = { noiseType, volume, spatialAudio }
  if (typeof window !== 'undefined' && window.api?.settings?.patch) {
    window.api.settings
      .patch({
        whiteNoisePreference: { noiseType, volume, spatialAudio }
      })
      .catch(() => {})
  }
}

const AUDIO_DB_NAME = 'focus-audio-cache'
const AUDIO_STORE_NAME = 'custom-sounds-v2'

interface StoredCustomAudioTrack {
  id: string
  name: string
  buffer: ArrayBuffer
  addedAt: number
}

export interface CustomAudioMeta {
  id: string
  name: string
  addedAt: number
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB not supported'))
    const req = indexedDB.open(AUDIO_DB_NAME, 2)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        d.createObjectStore(AUDIO_STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveCustomAudioTrackToStorage(track: StoredCustomAudioTrack): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openAudioDb()
    const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite')
    tx.objectStore(AUDIO_STORE_NAME).put(track)
  } catch {
    /* ignore storage errors */
  }
}

async function loadAllCustomAudioTracksFromStorage(): Promise<StoredCustomAudioTrack[]> {
  if (typeof indexedDB === 'undefined') return []
  try {
    const db = await openAudioDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readonly')
      const req = tx.objectStore(AUDIO_STORE_NAME).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

async function deleteCustomAudioTrackFromStorage(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openAudioDb()
    const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite')
    tx.objectStore(AUDIO_STORE_NAME).delete(id)
  } catch {
    /* ignore */
  }
}

async function clearAllCustomAudioTracksFromStorage(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openAudioDb()
    const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite')
    tx.objectStore(AUDIO_STORE_NAME).clear()
  } catch {
    /* ignore */
  }
}

const STORAGE_KEY_USER_PAUSED = 'focus-audio-user-paused'

export function loadUserPausedPreference(): boolean {
  if (typeof localStorage !== 'undefined') {
    try {
      const val = localStorage.getItem(STORAGE_KEY_USER_PAUSED)
      if (val !== null) {
        return val === 'true'
      }
    } catch {
      /* ignore */
    }
  }
  return false
}

export function saveUserPausedPreference(userPaused: boolean): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_USER_PAUSED, String(userPaused))
    } catch {
      /* ignore */
    }
  }
}

interface AudioEngineSnapshot {
  playing: boolean
  userPaused: boolean
  volume: number
  noiseType: NoiseType
  spatialAudio: boolean
  customAudioName?: string
  activeCustomTrackId?: string
  customTracks: CustomAudioMeta[]
}

let sharedAudioCtx: AudioContext | null = null
let sharedLimiter: DynamicsCompressorNode | null = null
let activeChimesCount = 0
const activeChimeTimers = new Set<ReturnType<typeof setTimeout>>()

export function getActiveChimesCountForTesting(): number {
  return activeChimesCount
}

export function getSharedAudioContext(): AudioContext | null {
  try {
    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        : null
    if (!AudioCtx) return null
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx({ sampleRate: SR })
      sharedLimiter = null
      sharedAudioCtx.onstatechange = () => {
        if (sharedAudioCtx?.state === 'closed') {
          sharedAudioCtx = null
          sharedLimiter = null
        }
      }
    }
    return sharedAudioCtx
  } catch {
    return null
  }
}

export function getMasterLimiter(ctx: AudioContext): AudioNode {
  if (sharedLimiter && sharedLimiter.context === ctx) {
    return sharedLimiter
  }
  if (typeof ctx.createDynamicsCompressor === 'function') {
    try {
      const compressor = ctx.createDynamicsCompressor()
      const now = ctx.currentTime
      if (compressor.threshold?.setValueAtTime) {
        compressor.threshold.setValueAtTime(-1.0, now)
        compressor.knee.setValueAtTime(0, now)
        compressor.ratio.setValueAtTime(20.0, now)
        compressor.attack.setValueAtTime(0.003, now)
        compressor.release.setValueAtTime(0.1, now)
      }
      compressor.connect(ctx.destination)
      sharedLimiter = compressor
      return compressor
    } catch {
      /* ignore and fallback to destination */
    }
  }
  return ctx.destination
}

function scheduleChimeSuspend(delayMs: number): void {
  const timer = setTimeout(() => {
    activeChimeTimers.delete(timer)
    activeChimesCount = Math.max(0, activeChimesCount - 1)
    const ctx = getSharedAudioContext()
    if (ctx && ctx.state === 'running' && !audioEngine.isPlaying && activeChimesCount === 0) {
      ctx.suspend().catch(() => {})
    }
  }, delayMs)
  activeChimeTimers.add(timer)
}

class AmbientAudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private parts: Cleanup[] = []
  private _playing = false
  private _userPaused = loadUserPausedPreference()
  private _volume = 0.8
  private _noiseType: NoiseType = 'cocoon'
  private _spatialAudio = true
  private _customTracks: Array<{
    id: string
    name: string
    buffer: ArrayBuffer
    decoded?: AudioBuffer
    addedAt: number
  }> = []
  private _activeCustomTrackId: string | null = null
  private spatialStage: SpatialStage | null = null
  private listeners = new Set<() => void>()
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null
  private isListeningToWindow = false
  private snapshot: AudioEngineSnapshot = {
    playing: false,
    userPaused: loadUserPausedPreference(),
    volume: 0.8,
    noiseType: 'cocoon',
    spatialAudio: true,
    customTracks: []
  }

  constructor() {
    const prefs = loadStoredPrefs()
    this._volume = prefs.volume
    this._noiseType = prefs.noiseType
    this._spatialAudio = prefs.spatialAudio
    this.updateSnapshot()
    this.attachWindowListeners()
    this.initCustomAudio()
  }

  private handleUnload = (): void => {
    this.destroy()
  }

  private attachWindowListeners(): void {
    if (this.isListeningToWindow) return
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.handleUserInteraction, { passive: true })
      window.addEventListener('keydown', this.handleUserInteraction, { passive: true })
      window.addEventListener('beforeunload', this.handleUnload)
      window.addEventListener('pagehide', this.handleUnload)
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange)
      }
      this.isListeningToWindow = true
    }
  }

  private detachWindowListeners(): void {
    if (!this.isListeningToWindow) return
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.handleUserInteraction)
      window.removeEventListener('keydown', this.handleUserInteraction)
      window.removeEventListener('beforeunload', this.handleUnload)
      window.removeEventListener('pagehide', this.handleUnload)
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange)
      }
      this.isListeningToWindow = false
    }
  }

  private handleUserInteraction = (): void => {
    if (this._playing && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
  }

  private handleDeviceChange = (): void => {
    if (!this._playing) return
    if (!this.ctx || this.ctx.state === 'closed') {
      this.recoverPlayback()
      return
    }
    if (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted') {
      this.ctx.resume().catch(() => {
        this.recoverPlayback()
      })
    }
  }

  private setupContextListeners(ctx: AudioContext): void {
    ctx.onstatechange = () => {
      if (ctx.state === 'closed') {
        sharedAudioCtx = null
        sharedLimiter = null
      }
      if (this._playing) {
        if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
          ctx.resume().catch(() => {})
        } else if (ctx.state === 'closed') {
          this.recoverPlayback()
        }
      }
    }
  }

  private recoverPlayback(): void {
    if (!this._playing) return
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer)
    this.recoveryTimer = setTimeout(() => {
      if (!this._playing) return
      try {
        this.ctx = null
        sharedAudioCtx = null
        sharedLimiter = null
        this.startNoise()
      } catch (err) {
        console.warn('AudioEngine playback auto-recovery failed:', err)
      }
    }, 100)
  }

  private updateSnapshot(): void {
    this.snapshot = {
      playing: this._playing,
      userPaused: this._userPaused,
      volume: this._volume,
      noiseType: this._noiseType,
      spatialAudio: this._spatialAudio,
      customAudioName: this.customAudioName || undefined,
      activeCustomTrackId: this._activeCustomTrackId || undefined,
      customTracks: this.customTracks
    }
  }

  public get customTracks(): CustomAudioMeta[] {
    return this._customTracks.map((t) => ({
      id: t.id,
      name: t.name,
      addedAt: t.addedAt
    }))
  }

  public get activeCustomTrackId(): string | undefined {
    return this._activeCustomTrackId || undefined
  }

  public get activeCustomTrack():
    | { id: string; name: string; buffer: ArrayBuffer; decoded?: AudioBuffer; addedAt: number }
    | undefined {
    if (this._activeCustomTrackId) {
      const match = this._customTracks.find((t) => t.id === this._activeCustomTrackId)
      if (match) return match
    }
    return this._customTracks[0]
  }

  public get customAudioName(): string {
    return this.activeCustomTrack?.name || ''
  }

  private decodeTrackBuffer(track: { buffer: ArrayBuffer; decoded?: AudioBuffer }): void {
    const ctx = this.ctx || getSharedAudioContext()
    if (ctx && typeof ctx.decodeAudioData === 'function') {
      try {
        const ret = ctx.decodeAudioData(
          track.buffer.slice(0),
          (decoded) => {
            track.decoded = decoded
            this.notify()
          },
          () => {}
        )
        if (ret && typeof (ret as Promise<AudioBuffer>).then === 'function') {
          ;(ret as Promise<AudioBuffer>)
            .then((decoded) => {
              track.decoded = decoded
              this.notify()
            })
            .catch(() => {})
        }
      } catch {
        /* ignore */
      }
    }
  }

  private initCustomAudio(): void {
    if (typeof window !== 'undefined') {
      loadAllCustomAudioTracksFromStorage()
        .then((tracks) => {
          if (tracks && tracks.length > 0) {
            this._customTracks = tracks.map((t) => ({
              id: t.id,
              name: t.name,
              buffer: t.buffer,
              addedAt: t.addedAt
            }))
            if (!this._activeCustomTrackId) {
              this._activeCustomTrackId = tracks[tracks.length - 1].id
            }
            const active = this.activeCustomTrack
            if (active) {
              this.decodeTrackBuffer(active)
            }
            this.notify()
          }
        })
        .catch(() => {})
    }
  }

  public async addCustomAudio(
    input: File | { name: string; buffer: ArrayBuffer }
  ): Promise<string> {
    let name: string
    let rawBuffer: ArrayBuffer

    if (input instanceof File) {
      name = input.name
      rawBuffer = await input.arrayBuffer()
    } else if ('buffer' in input) {
      name = input.name
      rawBuffer = input.buffer
    } else {
      name = (input as { name: string }).name
      rawBuffer = await (input as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer()
    }

    const id = `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const trackObj: {
      id: string
      name: string
      buffer: ArrayBuffer
      decoded?: AudioBuffer
      addedAt: number
    } = {
      id,
      name,
      buffer: rawBuffer,
      addedAt: Date.now()
    }

    try {
      const ctx = this.ensureContext()
      if (ctx && typeof ctx.decodeAudioData === 'function') {
        const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
          try {
            const ret = ctx.decodeAudioData(rawBuffer.slice(0), resolve, reject)
            if (ret && typeof (ret as Promise<AudioBuffer>).then === 'function') {
              ;(ret as Promise<AudioBuffer>).then(resolve).catch(reject)
            }
          } catch (e) {
            reject(e)
          }
        })
        trackObj.decoded = decoded
      }
    } catch {
      /* ignore decode error */
    }

    this._customTracks.push(trackObj)
    this._activeCustomTrackId = id
    saveCustomAudioTrackToStorage({
      id: trackObj.id,
      name: trackObj.name,
      buffer: trackObj.buffer,
      addedAt: trackObj.addedAt
    }).catch(() => {})

    this.setNoiseType('custom')
    if (this._playing) {
      this.crossfadeToNoise('custom')
    }
    this.notify()
    return id
  }

  public selectCustomAudio(id: string): void {
    const track = this._customTracks.find((t) => t.id === id)
    if (!track) return
    this._activeCustomTrackId = id

    if (!track.decoded) {
      this.decodeTrackBuffer(track)
    }

    this.setNoiseType('custom')
    if (this._playing) {
      this.crossfadeToNoise('custom')
    }
    this.notify()
  }

  public async removeCustomAudio(id: string): Promise<void> {
    const idx = this._customTracks.findIndex((t) => t.id === id)
    if (idx === -1) return
    this._customTracks.splice(idx, 1)
    deleteCustomAudioTrackFromStorage(id).catch(() => {})

    if (this._activeCustomTrackId === id) {
      if (this._customTracks.length > 0) {
        const nextTrack = this._customTracks[Math.min(idx, this._customTracks.length - 1)]
        this._activeCustomTrackId = nextTrack.id
        if (this._noiseType === 'custom' && this._playing) {
          this.crossfadeToNoise('custom')
        }
      } else {
        this._activeCustomTrackId = null
        if (this._noiseType === 'custom') {
          this.setNoiseType('waves')
        }
      }
    }
    this.notify()
  }

  public clearCustomAudio(): void {
    this._customTracks = []
    this._activeCustomTrackId = null
    clearAllCustomAudioTracksFromStorage().catch(() => {})
    if (this._noiseType === 'custom') {
      this.setNoiseType('waves')
    }
    this.notify()
  }

  public async loadCustomAudio(input: File | { name: string; buffer: ArrayBuffer }): Promise<void> {
    await this.addCustomAudio(input)
  }

  private connectMasterToOutput(ctx: AudioContext, gainNode: GainNode): void {
    if (this._spatialAudio) {
      if (!this.spatialStage) {
        this.spatialStage = createSpatialStage(ctx, getMasterLimiter(ctx))
      }
      gainNode.connect(this.spatialStage.input)
    } else {
      gainNode.connect(getMasterLimiter(ctx))
    }
  }

  private notify(): void {
    this.updateSnapshot()
    this.listeners.forEach((cb) => {
      try {
        cb()
      } catch (err) {
        console.error(err)
      }
    })
  }

  public subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  public getSnapshot = (): AudioEngineSnapshot => {
    return this.snapshot
  }

  public get isPlaying(): boolean {
    return this._playing
  }

  public get volume(): number {
    return this._volume
  }

  public get noiseType(): NoiseType {
    return this._noiseType
  }

  private ensureContext(): AudioContext {
    const ctx = getSharedAudioContext()
    if (!ctx) {
      throw new Error('AudioContext is not available')
    }
    if (this.ctx !== ctx) {
      this.ctx = ctx
      this.setupContextListeners(this.ctx)
      preloadAllSoundscapes(this.ctx)
    }
    return this.ctx
  }

  private startNoise(): void {
    this.stopAll()
    const ctx = this.ensureContext()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    this.masterGain = ctx.createGain()
    const now = ctx.currentTime
    const fadeInSec = 1.2
    if (
      typeof this.masterGain.gain.setValueAtTime === 'function' &&
      typeof this.masterGain.gain.linearRampToValueAtTime === 'function'
    ) {
      try {
        this.masterGain.gain.setValueAtTime(0, now)
        this.masterGain.gain.linearRampToValueAtTime(this._volume, now + fadeInSec)
      } catch {
        this.masterGain.gain.value = this._volume
      }
    } else {
      this.masterGain.gain.value = this._volume
    }
    this.connectMasterToOutput(ctx, this.masterGain)

    this.parts = BUILDERS[this._noiseType](ctx, this.masterGain)
  }

  private crossfadeToNoise(newType: NoiseType): void {
    const ctx = this.ensureContext()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const fadeDuration = 0.3 // 300ms smooth crossfade
    const now = ctx.currentTime

    // Fade out outgoing parts
    const outgoingGain = this.masterGain
    const outgoingParts = this.parts
    if (
      outgoingGain &&
      typeof outgoingGain.gain.setValueAtTime === 'function' &&
      typeof outgoingGain.gain.linearRampToValueAtTime === 'function'
    ) {
      try {
        if (typeof outgoingGain.gain.cancelScheduledValues === 'function') {
          outgoingGain.gain.cancelScheduledValues(now)
        }
        outgoingGain.gain.setValueAtTime(outgoingGain.gain.value, now)
        outgoingGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration)
        setTimeout(
          () => {
            for (const p of outgoingParts) {
              p.stop()
            }
            try {
              outgoingGain.disconnect()
            } catch {
              /* ignore */
            }
          },
          fadeDuration * 1000 + 50
        )
      } catch {
        for (const p of outgoingParts) {
          p.stop()
        }
        try {
          outgoingGain.disconnect()
        } catch {
          /* ignore */
        }
      }
    } else {
      for (const p of outgoingParts) {
        p.stop()
      }
      if (outgoingGain) {
        try {
          outgoingGain.disconnect()
        } catch {
          /* ignore */
        }
      }
    }

    // Create incoming gain and fade in
    const incomingGain = ctx.createGain()
    if (
      typeof incomingGain.gain.setValueAtTime === 'function' &&
      typeof incomingGain.gain.linearRampToValueAtTime === 'function'
    ) {
      try {
        incomingGain.gain.setValueAtTime(0.0001, now)
        incomingGain.gain.linearRampToValueAtTime(this._volume, now + fadeDuration)
      } catch {
        incomingGain.gain.value = this._volume
      }
    } else {
      incomingGain.gain.value = this._volume
    }
    this.connectMasterToOutput(ctx, incomingGain)

    this.masterGain = incomingGain
    this.parts = BUILDERS[newType](ctx, incomingGain)
  }

  private suspendContextIfIdle(): void {
    if (
      this.ctx &&
      this.ctx.state === 'running' &&
      this.parts.length === 0 &&
      activeChimesCount === 0
    ) {
      this.ctx.suspend().catch(() => {})
    }
  }

  private stopAll(): void {
    if (this.spatialStage) {
      this.spatialStage.cleanup.stop()
      this.spatialStage = null
    }
    const prevParts = this.parts
    const prevGain = this.masterGain
    this.parts = []
    this.masterGain = null

    if (
      prevGain &&
      this.ctx &&
      this.ctx.state === 'running' &&
      typeof prevGain.gain.cancelScheduledValues === 'function' &&
      typeof prevGain.gain.linearRampToValueAtTime === 'function'
    ) {
      try {
        const now = this.ctx.currentTime
        const fadeOutSec = 1.2
        prevGain.gain.cancelScheduledValues(now)
        prevGain.gain.setValueAtTime(prevGain.gain.value, now)
        prevGain.gain.linearRampToValueAtTime(0.0001, now + fadeOutSec)
        setTimeout(
          () => {
            for (const p of prevParts) {
              p.stop()
            }
            try {
              prevGain.disconnect()
            } catch {
              /* ignore */
            }
            this.suspendContextIfIdle()
          },
          Math.round(fadeOutSec * 1000 + 50)
        )
        return
      } catch {
        /* fallback to immediate stop */
      }
    }

    for (const p of prevParts) {
      p.stop()
    }
    if (prevGain) {
      try {
        prevGain.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.suspendContextIfIdle()
  }

  public get isUserPaused(): boolean {
    return this._userPaused
  }

  public setUserPaused(paused: boolean): void {
    this._userPaused = paused
    saveUserPausedPreference(paused)
    this.updateSnapshot()
    this.notify()
  }

  play(options?: { userInitiated?: boolean }): void {
    if (options?.userInitiated) {
      this._userPaused = false
      saveUserPausedPreference(false)
      this.updateSnapshot()
    }
    if (this._playing) return
    this._playing = true
    this.attachWindowListeners()
    this.startNoise()
    this.notify()
  }

  pause(options?: { userInitiated?: boolean }): void {
    if (options?.userInitiated) {
      this._userPaused = true
      saveUserPausedPreference(true)
      this.updateSnapshot()
    }
    if (!this._playing) {
      if (options?.userInitiated) {
        this.notify()
      }
      return
    }
    this._playing = false
    this.stopAll()
    this.notify()
  }

  toggle(options?: { userInitiated?: boolean }): void {
    const isUser = options?.userInitiated ?? true
    if (this._playing) {
      this.pause({ userInitiated: isUser })
    } else {
      this.play({ userInitiated: isUser })
    }
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v))
    if (
      this.masterGain &&
      this.ctx &&
      this.ctx.state === 'running' &&
      typeof this.masterGain.gain.cancelScheduledValues === 'function' &&
      typeof this.masterGain.gain.linearRampToValueAtTime === 'function'
    ) {
      try {
        const now = this.ctx.currentTime
        this.masterGain.gain.cancelScheduledValues(now)
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
        this.masterGain.gain.linearRampToValueAtTime(this._volume, now + 0.02)
      } catch {
        this.masterGain.gain.value = this._volume
      }
    } else if (this.masterGain) {
      this.masterGain.gain.value = this._volume
    }
    saveStoredPrefs(this._noiseType, this._volume, this._spatialAudio)
    this.notify()
  }

  setNoiseType(type: NoiseType): void {
    if (this._noiseType === type) return
    this._noiseType = type
    saveStoredPrefs(this._noiseType, this._volume, this._spatialAudio)
    if (this._playing) {
      this.crossfadeToNoise(type)
    }
    this.notify()
  }

  public get spatialAudio(): boolean {
    return this._spatialAudio
  }

  public setSpatialAudio(enabled: boolean): void {
    if (this._spatialAudio === enabled) return
    this._spatialAudio = enabled
    saveStoredPrefs(this._noiseType, this._volume, this._spatialAudio)
    if (this._playing && this.ctx && this.masterGain) {
      if (this.spatialStage) {
        this.spatialStage.cleanup.stop()
        this.spatialStage = null
      }
      try {
        this.masterGain.disconnect()
      } catch {
        /* ignore */
      }
      this.connectMasterToOutput(this.ctx, this.masterGain)
    }
    this.notify()
  }

  public toggleSpatialAudio(): void {
    this.setSpatialAudio(!this._spatialAudio)
  }

  destroy(): void {
    if (this.spatialStage) {
      this.spatialStage.cleanup.stop()
      this.spatialStage = null
    }
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer)
      this.recoveryTimer = null
    }
    this.detachWindowListeners()
    this.pause()
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {})
    }
    this.ctx = null
    sharedAudioCtx = null
    sharedLimiter = null
  }
}

export const audioEngine = new AmbientAudioEngine()
prewarmNoiseGenerators()

export function resetAudioEngineForTesting(): void {
  audioEngine.destroy()
  audioEngine.clearCustomAudio()
  audioEngine.setUserPaused(false)
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY_USER_PAUSED)
    } catch {
      /* ignore */
    }
  }
  sharedAudioCtx = null
  sharedLimiter = null
  activeChimesCount = 0
  activeChimeTimers.forEach((t) => clearTimeout(t))
  activeChimeTimers.clear()
  resetPrewarmedBuffersForTesting()
}

export function formatNoiseType(type: NoiseType): string {
  switch (type) {
    case 'waves':
      return 'Ocean Waves'
    case 'rain':
      return 'Rain'
    case 'wind':
      return 'Wind'
    case 'stream':
      return 'Stream'
    case 'white-noise':
      return 'White Noise'
    case 'cocoon':
      return 'Cocoon'
    case 'deep':
      return 'Deep'
    case 'city-tokyo':
      return 'Tokyo'
    case 'city-london':
      return 'London'
    case 'city-reykjavik':
      return 'Reykjavik'
    case 'custom':
      return audioEngine.customAudioName || 'Custom Sound'
    default:
      return type
  }
}

export interface UseAudioEngineReturn extends AudioEngineSnapshot {
  play: (options?: { userInitiated?: boolean }) => void
  pause: (options?: { userInitiated?: boolean }) => void
  toggle: (options?: { userInitiated?: boolean }) => void
  systemPlay: () => void
  systemPause: () => void
  setUserPaused: (paused: boolean) => void
  setVolume: (v: number) => void
  setNoiseType: (t: NoiseType) => void
  setSpatialAudio: (enabled: boolean) => void
  toggleSpatialAudio: () => void
  addCustomAudio: (input: File | { name: string; buffer: ArrayBuffer }) => Promise<string>
  selectCustomAudio: (id: string) => void
  removeCustomAudio: (id: string) => Promise<void>
  loadCustomAudio: (input: File | { name: string; buffer: ArrayBuffer }) => Promise<void>
  clearCustomAudio: () => void
}

const stableAudioEngineActions = {
  play: (options?: { userInitiated?: boolean }) =>
    audioEngine.play({ userInitiated: options?.userInitiated ?? true }),
  pause: (options?: { userInitiated?: boolean }) =>
    audioEngine.pause({ userInitiated: options?.userInitiated ?? true }),
  toggle: (options?: { userInitiated?: boolean }) =>
    audioEngine.toggle({ userInitiated: options?.userInitiated ?? true }),
  systemPlay: () => audioEngine.play({ userInitiated: false }),
  systemPause: () => audioEngine.pause({ userInitiated: false }),
  setUserPaused: (paused: boolean) => audioEngine.setUserPaused(paused),
  setVolume: (v: number) => audioEngine.setVolume(v),
  setNoiseType: (t: NoiseType) => audioEngine.setNoiseType(t),
  setSpatialAudio: (enabled: boolean) => audioEngine.setSpatialAudio(enabled),
  toggleSpatialAudio: () => audioEngine.toggleSpatialAudio(),
  addCustomAudio: (input: File | { name: string; buffer: ArrayBuffer }) =>
    audioEngine.addCustomAudio(input),
  selectCustomAudio: (id: string) => audioEngine.selectCustomAudio(id),
  removeCustomAudio: (id: string) => audioEngine.removeCustomAudio(id),
  loadCustomAudio: (input: File | { name: string; buffer: ArrayBuffer }) =>
    audioEngine.loadCustomAudio(input),
  clearCustomAudio: () => audioEngine.clearCustomAudio()
}

export function useAudioEngine(): UseAudioEngineReturn {
  const state = useSyncExternalStore(audioEngine.subscribe, audioEngine.getSnapshot)
  return {
    ...state,
    play: stableAudioEngineActions.play,
    pause: stableAudioEngineActions.pause,
    toggle: stableAudioEngineActions.toggle,
    systemPlay: stableAudioEngineActions.systemPlay,
    systemPause: stableAudioEngineActions.systemPause,
    setUserPaused: stableAudioEngineActions.setUserPaused,
    setVolume: stableAudioEngineActions.setVolume,
    setNoiseType: stableAudioEngineActions.setNoiseType,
    setSpatialAudio: stableAudioEngineActions.setSpatialAudio,
    toggleSpatialAudio: stableAudioEngineActions.toggleSpatialAudio,
    addCustomAudio: stableAudioEngineActions.addCustomAudio,
    selectCustomAudio: stableAudioEngineActions.selectCustomAudio,
    removeCustomAudio: stableAudioEngineActions.removeCustomAudio,
    loadCustomAudio: stableAudioEngineActions.loadCustomAudio,
    clearCustomAudio: stableAudioEngineActions.clearCustomAudio
  }
}

const pendingAudioTimeouts = new Set<NodeJS.Timeout>()

function safeScheduleDisconnect(nodeA: AudioNode, nodeB?: AudioNode, delayMs: number = 500): void {
  const timer = setTimeout(() => {
    pendingAudioTimeouts.delete(timer)
    try {
      nodeA.disconnect()
      nodeB?.disconnect()
    } catch {
      /* ignore */
    }
  }, delayMs)
  pendingAudioTimeouts.add(timer)
}

export function clearPendingAudioTimeouts(): void {
  for (const timer of pendingAudioTimeouts) {
    clearTimeout(timer)
  }
  pendingAudioTimeouts.clear()
}

export async function playFocusChime(
  type: 'start' | 'complete' | 'break' = 'complete'
): Promise<void> {
  let chimeScheduled = false
  try {
    const ctx = getSharedAudioContext()
    if (!ctx) return
    activeChimesCount++
    if (ctx.state !== 'running') {
      try {
        await ctx.resume()
      } catch {
        // ignore resume failures if autoplay is blocked
      }
    }
    const limiter = getMasterLimiter(ctx)
    const now = ctx.currentTime

    if (type === 'start') {
      // Warm rising tone: F4 (349Hz) -> A4 (440Hz)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(349.23, now)
      osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.18)
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc.connect(gain)
      gain.connect(limiter)
      osc.start(now)
      osc.stop(now + 0.35)
      safeScheduleDisconnect(osc, gain, 400)
      chimeScheduled = true
      scheduleChimeSuspend(450)
    } else if (type === 'break') {
      // Gentle soft two-tone descend
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, now)
      osc.frequency.exponentialRampToValueAtTime(392.0, now + 0.22)
      gain.gain.setValueAtTime(0.09, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
      osc.connect(gain)
      gain.connect(limiter)
      osc.start(now)
      osc.stop(now + 0.4)
      safeScheduleDisconnect(osc, gain, 450)
      chimeScheduled = true
      scheduleChimeSuspend(500)
    } else {
      // Celebratory harmonic chord: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
      const notes = [
        { freq: 523.25, delay: 0, dur: 0.9, vol: 0.1 },
        { freq: 659.25, delay: 0.08, dur: 1.0, vol: 0.1 },
        { freq: 783.99, delay: 0.16, dur: 1.2, vol: 0.12 },
        { freq: 1046.5, delay: 0.24, dur: 1.4, vol: 0.09 }
      ]
      notes.forEach(({ freq, delay, dur, vol }) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(vol, now + delay)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur)
        osc.connect(gain)
        gain.connect(limiter)
        osc.start(now + delay)
        osc.stop(now + delay + dur)
        safeScheduleDisconnect(osc, gain, Math.round((delay + dur) * 1000 + 100))
      })
      chimeScheduled = true
      scheduleChimeSuspend(1800)
    }
  } catch (e) {
    console.warn('Audio chime playback omitted:', e)
  } finally {
    if (!chimeScheduled && activeChimesCount > 0) {
      scheduleChimeSuspend(0)
    }
  }
}
