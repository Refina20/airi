#!/usr/bin/env node
/**
 * Expression MCP Server
 *
 * This is an MCP (Model Context Protocol) server that wraps the
 * expression-api-server HTTP API, allowing OpenClaw agents to
 * control Live2D expressions.
 *
 * Usage: node mcp-server.js
 *
 * The server communicates with the expression-api-server at
 * http://127.0.0.1:3100 and exposes MCP tools for expression control.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

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
// MCP Server Setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'airi-expression-mcp',
  version: '1.0.0',
})

// Register tools
server.registerTool(
  'expression_set',
  {
    description: 'Set a Live2D expression or parameter value. Use a boolean (true/false) to toggle an expression, or a number (0.0-1.0) for fine control. Optionally provide a duration in seconds for auto-reset.',
    inputSchema: {
      name: { type: 'string', description: 'Expression name or Live2D parameter ID (e.g. "Cry", "ParamWatermarkOFF")' },
      value: { type: ['boolean', 'number'], description: 'true/false for toggle, or 0.0-1.0 for numeric control' },
      duration: { type: ['number', 'null'], description: 'Seconds until auto-reset to default. Omit for permanent change.' },
    },
  },
  async ({ name, value, duration }) => {
    const available = await isApiAvailable()
    if (!available) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Expression API server is not available. Please start the expression-api-server.' }) }],
        isError: true,
      }
    }

    const result = await fetchExpressionApi('/set', {
      method: 'POST',
      body: JSON.stringify({ name, value, duration }),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    }
  },
)

server.registerTool(
  'expression_get',
  {
    description: 'Get the current state of a Live2D expression or parameter. Omit the name to list all available expressions with their current values.',
    inputSchema: {
      name: { type: ['string', 'null'], description: 'Expression name or parameter ID. Omit to list all.' },
    },
  },
  async ({ name }) => {
    const available = await isApiAvailable()
    if (!available) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Expression API server is not available.' }) }],
        isError: true,
      }
    }

    const result = await fetchExpressionApi(name ? `?name=${encodeURIComponent(name)}` : '')
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    }
  },
)

server.registerTool(
  'expression_toggle',
  {
    description: 'Toggle a Live2D expression (flip between default and active state). Optionally provide a duration in seconds for auto-reset.',
    inputSchema: {
      name: { type: 'string', description: 'Expression name or parameter ID to toggle' },
      duration: { type: ['number', 'null'], description: 'Seconds until auto-reset. Omit for permanent toggle.' },
    },
  },
  async ({ name, duration }) => {
    const available = await isApiAvailable()
    if (!available) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Expression API server is not available.' }) }],
        isError: true,
      }
    }

    const result = await fetchExpressionApi('/toggle', {
      method: 'POST',
      body: JSON.stringify({ name, duration }),
    })
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    }
  },
)

server.registerTool(
  'expression_reset_all',
  {
    description: 'Reset all expressions to their default values.',
    inputSchema: {},
  },
  async () => {
    const available = await isApiAvailable()
    if (!available) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Expression API server is not available.' }) }],
        isError: true,
      }
    }

    const result = await fetchExpressionApi('/reset', { method: 'POST' })
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    }
  },
)

server.registerTool(
  'expression_save_defaults',
  {
    description: 'Save the current expression state as the new defaults. Persists across app restarts.',
    inputSchema: {},
  },
  async () => {
    const available = await isApiAvailable()
    if (!available) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Expression API server is not available.' }) }],
        isError: true,
      }
    }

    const result = await fetchExpressionApi('/save-defaults', { method: 'POST' })
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    }
  },
)

// ---------------------------------------------------------------------------
// Server Startup
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Expression MCP Server running on stdio')
}

main().catch((error) => {
  console.error('Failed to start Expression MCP Server:', error)
  process.exit(1)
})
