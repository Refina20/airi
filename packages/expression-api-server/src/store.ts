import type {
  ExpressionEntry,
  ExpressionGroupDefinition,
  ExpressionState,
  ExpressionToolResult,
} from './types.js'

/**
 * In-memory expression store (similar to Airi's Pinia expression-store)
 *
 * This is the bridge between OpenClaw agent and Airi WebUI.
 * The OpenClaw agent calls HTTP API to update state,
 * and Airi WebUI subscribes via WebSocket to receive changes.
 */
export class ExpressionStore {
  /** Map keyed by expression/parameter name -> entry */
  private expressions = new Map<string, ExpressionEntry>()

  /** Named expression groups parsed from model */
  private expressionGroups = new Map<string, ExpressionGroupDefinition>()

  /** Currently loaded model ID */
  private modelId = ''

  /** WebSocket clients subscribed to expression changes */
  private wsClients: Set<any> = new Set()

  /** Auto-reset timers */
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  // ---- Public API ----------------------------------------------------------

  /**
   * Register all expression entries from the model
   * Called when Airi WebUI loads a new Live2D model
   */
  registerExpressions(
    id: string,
    groups: ExpressionGroupDefinition[],
    parameterEntries: ExpressionEntry[],
  ): ExpressionToolResult {
    this.clearAllTimers()
    this.expressions.clear()
    this.expressionGroups.clear()
    this.modelId = id

    // Register expression groups
    for (const group of groups) {
      this.expressionGroups.set(group.name, group)
    }

    // Register individual parameter entries
    for (const entry of parameterEntries) {
      this.expressions.set(entry.name, { ...entry })
    }

    this.broadcast({
      type: 'model_loaded',
      payload: { modelId: id, expressions: this.getAllStates() },
    })

    return { success: true }
  }

  /**
   * Set an expression or parameter value
   */
  set(name: string, value: boolean | number, duration?: number): ExpressionToolResult {
    const resolved = this.resolve(name)

    if (!resolved) {
      return {
        success: false,
        error: `Expression or parameter "${name}" not found.`,
        available: this.getAllNames(),
      }
    }

    const numericValue = typeof value === 'boolean' ? (value ? 1 : 0) : value

    if (resolved.kind === 'group') {
      const states: ExpressionState[] = []
      for (const param of resolved.group.parameters) {
        const entry = this.expressions.get(param.parameterId)
        if (entry) {
          this.applyValue(entry, numericValue, duration)
          states.push(this.toState(entry))
        }
      }
      this.broadcast({
        type: 'expression_change',
        payload: { group: name, states },
      })
      return { success: true, state: states }
    }

    // Direct parameter
    this.applyValue(resolved.entry, numericValue, duration)
    this.broadcast({
      type: 'expression_change',
      payload: { name, state: this.toState(resolved.entry), action: 'set' },
    })
    return { success: true, state: this.toState(resolved.entry) }
  }

  /**
   * Get expression state
   */
  get(name?: string): ExpressionToolResult {
    if (!name) {
      return { success: true, state: this.getAllStates() }
    }

    const resolved = this.resolve(name)
    if (!resolved) {
      return {
        success: false,
        error: `Expression or parameter "${name}" not found.`,
        available: this.getAllNames(),
      }
    }

    if (resolved.kind === 'group') {
      const states: ExpressionState[] = []
      for (const param of resolved.group.parameters) {
        const entry = this.expressions.get(param.parameterId)
        if (entry)
          states.push(this.toState(entry))
      }
      return { success: true, state: states }
    }

    return { success: true, state: this.toState(resolved.entry) }
  }

  /**
   * Toggle an expression (flip between default and non-default)
   */
  toggle(name: string, duration?: number): ExpressionToolResult {
    const resolved = this.resolve(name)
    if (!resolved) {
      return {
        success: false,
        error: `Expression or parameter "${name}" not found.`,
        available: this.getAllNames(),
      }
    }

    if (resolved.kind === 'group') {
      const isActive = resolved.group.parameters.some((p) => {
        if (p.value === 0)
          return false
        const entry = this.expressions.get(p.parameterId)
        return entry && entry.currentValue === p.value
      })

      const states: ExpressionState[] = []
      for (const param of resolved.group.parameters) {
        const entry = this.expressions.get(param.parameterId)
        if (entry) {
          const newValue = isActive ? entry.modelDefault : param.value
          this.applyValue(entry, newValue, duration)
          states.push(this.toState(entry))
        }
      }
      this.broadcast({
        type: 'expression_change',
        payload: { group: name, states, action: 'toggle' },
      })
      return { success: true, state: states }
    }

    // Direct parameter toggle
    const entry = resolved.entry
    const newValue = entry.currentValue !== entry.modelDefault ? entry.modelDefault : entry.targetValue
    this.applyValue(entry, newValue, duration)
    this.broadcast({
      type: 'expression_change',
      payload: { name, state: this.toState(entry), action: 'toggle' },
    })
    return { success: true, state: this.toState(entry) }
  }

  /**
   * Reset all expressions to their default values
   */
  resetAll(): ExpressionToolResult {
    this.clearAllTimers()
    const states: ExpressionState[] = []
    for (const entry of this.expressions.values()) {
      entry.currentValue = entry.modelDefault
      states.push(this.toState(entry))
    }
    this.broadcast({
      type: 'expression_reset',
      payload: { states },
    })
    return { success: true, state: states }
  }

  /**
   * Save current values as defaults (persisted across restarts)
   */
  saveDefaults(): ExpressionToolResult {
    if (!this.modelId) {
      return { success: false, error: 'No model loaded.' }
    }

    const defaults: Record<string, number> = {}
    for (const [name, entry] of this.expressions) {
      entry.defaultValue = entry.currentValue
      defaults[name] = entry.currentValue
    }

    // Persist to localStorage (accessible by Airi WebUI)
    try {
      localStorage.setItem(`expression-defaults:${this.modelId}`, JSON.stringify(defaults))
    }
    catch {
      // localStorage may not be available in Node.js
    }

    this.broadcast({
      type: 'expression_save_defaults',
      payload: { modelId: this.modelId, defaults },
    })
    return { success: true }
  }

  /**
   * Register WebSocket client for expression change notifications
   */
  registerWsClient(ws: any): void {
    this.wsClients.add(ws)
    ws.addEventListener('close', () => {
      this.wsClients.delete(ws)
    })
  }

  /**
   * Get all expression states (for LLM response)
   */
  getAllStates(): ExpressionState[] {
    const states: ExpressionState[] = []
    for (const entry of this.expressions.values()) {
      states.push(this.toState(entry))
    }
    return states
  }

  /**
   * Get all available expression names
   */
  getAllNames(): string[] {
    return Array.from(this.expressions.keys())
  }

  /**
   * Get the currently loaded model ID
   */
  getModelId(): string {
    return this.modelId
  }

  // ---- Private helpers -----------------------------------------------------

  private resolve(name: string) {
    const group = this.expressionGroups.get(name)
    if (group)
      return { kind: 'group' as const, group }

    const entry = this.expressions.get(name)
    if (entry)
      return { kind: 'param' as const, entry }

    return null
  }

  private toState(entry: ExpressionEntry): ExpressionState {
    return {
      name: entry.name,
      value: entry.currentValue,
      default: entry.defaultValue,
      active: entry.currentValue !== entry.defaultValue,
    }
  }

  private applyValue(entry: ExpressionEntry, value: number, duration?: number) {
    // Cancel existing timer
    if (entry.resetTimer) {
      clearTimeout(entry.resetTimer)
      entry.resetTimer = undefined
    }

    entry.currentValue = value

    // Schedule auto-reset if duration > 0
    if (duration && duration > 0) {
      const resetTo = entry.defaultValue
      entry.resetTimer = setTimeout(() => {
        entry.currentValue = resetTo
        entry.resetTimer = undefined
        this.broadcast({
          type: 'expression_change',
          payload: { name: entry.name, state: this.toState(entry), action: 'auto_reset' },
        })
      }, duration * 1000)
    }
  }

  private clearAllTimers() {
    for (const entry of this.expressions.values()) {
      if (entry.resetTimer) {
        clearTimeout(entry.resetTimer)
        entry.resetTimer = undefined
      }
    }
  }

  private broadcast(message: any) {
    const data = JSON.stringify(message)
    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }
}
