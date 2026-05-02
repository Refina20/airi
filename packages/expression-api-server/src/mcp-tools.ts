/**
 * OpenClaw MCP Tool - Expression Control
 *
 * This tool wraps the expression-api-server HTTP API calls,
 * allowing the OpenClaw Airi agent to control Live2D expressions.
 */

import { tool } from '@xsai/tool'
import { z } from 'zod'

const API_BASE = 'http://127.0.0.1:3100/api/expressions'

/**
 * Fetch helper for the expression API
 */
async function fetchExpressionApi(endpoint: string, options?: RequestInit): Promise<any> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  return response.json()
}

/**
 * Check if the expression API server is available
 */
async function isApiAvailable(): Promise<boolean> {
  try {
    await fetch(`${API_BASE}/names`, { signal: AbortSignal.timeout(2000) })
    return true
  }
  catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const tools = [
  // ----- expression_set ----------------------------------------------------
  tool({
    name: 'expression_set',
    description: [
      'Set a Live2D expression or parameter value.',
      'Use a boolean (true/false) to toggle an expression, or a number (0.0-1.0) for fine control.',
      'Optionally provide a duration in seconds for auto-reset.',
      'Examples: expression_set("Cry", true), expression_set("Blush", 0.7, 3)',
    ].join(' '),
    execute: async (params: { name: string, value: boolean | number, duration?: number }) => {
      const available = await isApiAvailable()
      if (!available) {
        return JSON.stringify({ success: false, error: 'Expression API server not available. Please start the expression-api-server.' })
      }

      const result = await fetchExpressionApi('/set', {
        method: 'POST',
        body: JSON.stringify({ name: params.name, value: params.value, duration: params.duration }),
      })
      return JSON.stringify(result)
    },
    parameters: z.object({
      name: z.string().describe('Expression name or Live2D parameter ID (e.g. "Cry", "ParamWatermarkOFF")'),
      value: z.union([z.boolean(), z.number()]).describe('true/false for toggle, or 0.0-1.0 for numeric control'),
      duration: z.number().optional().describe('Seconds until auto-reset to default. Omit for permanent change.'),
    }),
  }),

  // ----- expression_get ----------------------------------------------------
  tool({
    name: 'expression_get',
    description: [
      'Get the current state of a Live2D expression or parameter.',
      'Omit the name to list all available expressions with their current values.',
    ].join(' '),
    execute: async (params: { name?: string }) => {
      const available = await isApiAvailable()
      if (!available) {
        return JSON.stringify({ success: false, error: 'Expression API server not available.' })
      }

      const result = await fetchExpressionApi(params.name ? `?name=${encodeURIComponent(params.name)}` : '')
      return JSON.stringify(result)
    },
    parameters: z.object({
      name: z.string().optional().describe('Expression name or parameter ID. Omit to list all.'),
    }),
  }),

  // ----- expression_toggle -------------------------------------------------
  tool({
    name: 'expression_toggle',
    description: [
      'Toggle a Live2D expression (flip between default and active state).',
      'Optionally provide a duration in seconds for auto-reset.',
    ].join(' '),
    execute: async (params: { name: string, duration?: number }) => {
      const available = await isApiAvailable()
      if (!available) {
        return JSON.stringify({ success: false, error: 'Expression API server not available.' })
      }

      const result = await fetchExpressionApi('/toggle', {
        method: 'POST',
        body: JSON.stringify({ name: params.name, duration: params.duration }),
      })
      return JSON.stringify(result)
    },
    parameters: z.object({
      name: z.string().describe('Expression name or parameter ID to toggle'),
      duration: z.number().optional().describe('Seconds until auto-reset. Omit for permanent toggle.'),
    }),
  }),

  // ----- expression_reset_all ----------------------------------------------
  tool({
    name: 'expression_reset_all',
    description: 'Reset all expressions to their default values.',
    execute: async () => {
      const available = await isApiAvailable()
      if (!available) {
        return JSON.stringify({ success: false, error: 'Expression API server not available.' })
      }

      const result = await fetchExpressionApi('/reset', { method: 'POST' })
      return JSON.stringify(result)
    },
    parameters: z.object({}),
  }),

  // ----- expression_save_defaults ------------------------------------------
  tool({
    name: 'expression_save_defaults',
    description: 'Save the current expression state as the new defaults. Persists across app restarts.',
    execute: async () => {
      const available = await isApiAvailable()
      if (!available) {
        return JSON.stringify({ success: false, error: 'Expression API server not available.' })
      }

      const result = await fetchExpressionApi('/save-defaults', { method: 'POST' })
      return JSON.stringify(result)
    },
    parameters: z.object({}),
  }),

  // ----- expression_list ---------------------------------------------------
  tool({
    name: 'expression_list',
    description: 'List all available expression names.',
    execute: async () => {
      const available = await isApiAvailable()
      if (!available) {
        return JSON.stringify({ success: false, error: 'Expression API server not available.' })
      }

      const result = await fetchExpressionApi('/names')
      return JSON.stringify(result)
    },
    parameters: z.object({}),
  }),
]

/**
 * Export all expression tools as a resolved promise array
 */
export const expressionMcpTools = async () => Promise.all(tools)
