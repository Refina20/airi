/**
 * Expression WebSocket Client for Airi WebUI
 *
 * This client subscribes to the expression-api-server WebSocket
 * and applies expression changes to the Live2D model.
 */

import type { ExpressionEntry, ExpressionGroupDefinition, WebSocketMessage } from './types.js'

interface ExpressionWebSocketClientOptions {
  /** WebSocket URL (default: ws://127.0.0.1:3100/ws/expressions) */
  url?: string
  /** Callback when expression changes */
  onExpressionChange?: (data: any) => void
  /** Callback when model is loaded */
  onModelLoaded?: (data: any) => void
  /** Callback when connection is established */
  onConnected?: () => void
  /** Callback when connection is closed */
  onClosed?: () => void
  /** Callback when error occurs */
  onError?: (error: Error) => void
}

export class ExpressionWebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private onExpressionChange?: (data: any) => void
  private onModelLoaded?: (data: any) => void
  private onConnected?: () => void
  private onClosed?: () => void
  private onError?: (error: Error) => void

  constructor(options: ExpressionWebSocketClientOptions = {}) {
    this.url = options.url || 'ws://127.0.0.1:3100/ws/expressions'
    this.onExpressionChange = options.onExpressionChange
    this.onModelLoaded = options.onModelLoaded
    this.onConnected = options.onConnected
    this.onClosed = options.onClosed
    this.onError = options.onError

    this.connect()
  }

  /**
   * Connect to the expression API server
   */
  private connect(): void {
    try {
      this.ws = new WebSocket(this.url)
    }
    catch (error) {
      this.handleError(error as Error)
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      console.log('[expression-ws] Connected to expression API server')
      this.reconnectAttempts = 0
      this.onConnected?.()
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage

        switch (message.type) {
          case 'expression_change':
            this.onExpressionChange?.(message.payload)
            break
          case 'expression_reset':
            this.onExpressionChange?.(message.payload)
            break
          case 'expression_save_defaults':
            this.onExpressionChange?.(message.payload)
            break
          case 'model_loaded':
            this.onModelLoaded?.(message.payload)
            break
          case 'model_registered':
            this.onModelLoaded?.(message.payload)
            break
        }
      }
      catch (error) {
        this.handleError(error as Error)
      }
    }

    this.ws.onclose = () => {
      console.log('[expression-ws] Disconnected from expression API server')
      this.onClosed?.()
      this.scheduleReconnect()
    }

    this.ws.onerror = (error) => {
      this.handleError(error as Event)
    }
  }

  /**
   * Register a Live2D model with the server
   */
  registerModel(modelId: string, groups: ExpressionGroupDefinition[], parameters: ExpressionEntry[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[expression-ws] WebSocket not connected, cannot register model')
      return
    }

    this.ws.send(JSON.stringify({
      type: 'register_model',
      payload: { modelId, groups, parameters },
    }))
  }

  /**
   * Set an expression directly (bypasses OpenClaw agent)
   */
  setExpression(name: string, value: boolean | number, duration?: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[expression-ws] WebSocket not connected, cannot set expression')
      return
    }

    this.ws.send(JSON.stringify({
      type: 'set',
      payload: { name, value, duration },
    }))
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[expression-ws] Max reconnect attempts reached, stopping reconnection')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * 2 ** (this.reconnectAttempts - 1)
    console.log(`[expression-ws] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  /**
   * Handle errors
   */
  private handleError(error: Event | Error): void {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[expression-ws] Error:', message)
    this.onError?.(error instanceof Error ? error : new Error(message))
  }

  /**
   * Close the WebSocket connection
   */
  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}
