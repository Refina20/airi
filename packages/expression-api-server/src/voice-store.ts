/**
 * Voice Settings Store
 * Persists voice/TTS settings to filesystem, accessible by both
 * frontend and OpenClaw agent via the same HTTP API.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface VoiceSettings {
  voiceId: string
  provider: string
  model: string
  pitch: number
  rate: number
  volume: number
  ssmlEnabled: boolean
}

export class VoiceSettingsStore {
  private settings: VoiceSettings = {
    voiceId: '',
    provider: '',
    model: '',
    pitch: 0,
    rate: 1,
    volume: 1,
    ssmlEnabled: false,
  }

  private readonly filePath: string
  private subscribers: Set<() => void> = new Set()

  constructor(dataDir: string = './data') {
    this.filePath = path.join(dataDir, 'voice-settings.json')
    this.load()
  }

  getSettings(): VoiceSettings {
    return { ...this.settings }
  }

  setSettings(partial: Partial<VoiceSettings>): void {
    this.settings = { ...this.settings, ...partial }
    this.save()
    this.notify()
  }

  private load(): void {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8')
      this.settings = { ...this.settings, ...JSON.parse(data) }
    }
    catch {
      // File doesn't exist yet, use defaults
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2))
    }
    catch (err) {
      console.error('[VoiceSettingsStore] Save failed:', err)
    }
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  private notify(): void {
    for (const fn of this.subscribers) fn()
  }
}
