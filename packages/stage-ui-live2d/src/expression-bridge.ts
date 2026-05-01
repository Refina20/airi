/**
 * Airi WebUI Integration for Expression Control
 *
 * This module integrates the expression-api-server with Airi WebUI.
 * It subscribes to WebSocket expression changes and applies them
 * to the Live2D model through the expression-store.
 */

import type { ExpressionEntry, ExpressionGroupDefinition } from '@proj-airi/expression-api-server/types'

import { ExpressionWebSocketClient } from '@proj-airi/expression-api-server/websocket-client'
import { useExpressionStore } from '@proj-airi/stage-ui-live2d/stores/expression-store'

/**
 * Initialize the expression WebSocket client for Airi WebUI
 */
export function initExpressionBridge() {
  const store = useExpressionStore()
  let client: ExpressionWebSocketClient | null = null

  // Create the WebSocket client
  client = new ExpressionWebSocketClient({
    url: 'ws://127.0.0.1:3100/ws/expressions',

    onConnected: () => {
      console.log('[expression-bridge] Connected to expression API server')
    },

    onClosed: () => {
      console.log('[expression-bridge] Disconnected from expression API server')
    },

    onError: (error) => {
      console.error('[expression-bridge] Error:', error)
    },

    onModelLoaded: (data) => {
      console.log('[expression-bridge] Model loaded:', data)
    },

    onExpressionChange: (data) => {
      console.log('[expression-bridge] Expression change:', data)

      // Apply expression changes to the Live2D model
      // The expression-store will handle the actual application
      if (data.states) {
        for (const state of data.states) {
          const entry = store.expressions.get(state.name)
          if (entry) {
            entry.currentValue = state.value
          }
        }
      }
    },
  })

  // Expose the client globally for debugging
  (window as any).__expressionClient = client

  return {
    client,
    /**
     * Register a Live2D model with the expression API server
     */
    registerModel: (modelId: string, groups: ExpressionGroupDefinition[], parameters: ExpressionEntry[]) => {
      client?.registerModel(modelId, groups, parameters)
    },
    /**
     * Set an expression directly (bypasses OpenClaw agent)
     */
    setExpression: (name: string, value: boolean | number, duration?: number) => {
      client?.setExpression(name, value, duration)
    },
    /**
     * Close the WebSocket connection
     */
    close: () => {
      client?.close()
    },
  }
}
