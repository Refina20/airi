/**
 * Expression API Server - Main entry point
 *
 * This server provides:
 * 1. HTTP API for OpenClaw agent to control expressions
 * 2. WebSocket for Airi WebUI to subscribe to expression changes
 */

import type { IncomingMessage } from 'node:http'

import type { WebSocketMessage } from './types.js'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'

import { ExpressionStore } from './store.js'

// Minimal WebSocket interface shared between ws and DOM
interface WsLike { on: (event: string, handler: (...args: any[]) => void) => any, readyState: number, send: (data: string) => void, close: () => void }

// ---- Global Store ----------------------------------------------------------

const store = new ExpressionStore()
const app = new Hono()

// ---- HTTP API Routes -------------------------------------------------------

/** GET /api/expressions - Get all expression states */
app.get('/api/expressions', (c) => {
  const states = store.getAllStates()
  return c.json({ success: true, state: states })
})

/** POST /api/expressions/set - Set an expression */
app.post('/api/expressions/set', async (c) => {
  const body = await c.req.json()
  const result = store.set(body.name, body.value, body.duration)
  return c.json(result)
})

/** POST /api/expressions/toggle - Toggle an expression */
app.post('/api/expressions/toggle', async (c) => {
  const body = await c.req.json()
  const result = store.toggle(body.name, body.duration)
  return c.json(result)
})

/** POST /api/expressions/reset - Reset all expressions */
app.post('/api/expressions/reset', (c) => {
  const result = store.resetAll()
  return c.json(result)
})

/** POST /api/expressions/save-defaults - Save defaults */
app.post('/api/expressions/save-defaults', (c) => {
  const result = store.saveDefaults()
  return c.json(result)
})

/** GET /api/expressions/names - Get all available expression names */
app.get('/api/expressions/names', (c) => {
  return c.json({ names: store.getAllNames() })
})

/** GET /api/expressions/model - Get current model ID */
app.get('/api/expressions/model', (c) => {
  return c.json({ modelId: store.getModelId() })
})

// ---- WebSocket Endpoint ----------------------------------------------------

const wss = new WebSocketServer({ noServer: true })

/** WebSocket endpoint for Airi WebUI to subscribe to expression changes */
wss.on('connection', (ws) => {
  store.registerWsClient(ws)
  console.log('[expression-api] New WebSocket client connected')

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage

      switch (message.type) {
        case 'register_model': {
          // Airi WebUI registers a model
          const { modelId, groups, parameters } = message.payload
          store.registerExpressions(modelId, groups, parameters)
          ws.send(JSON.stringify({ type: 'model_registered', payload: { modelId } }))
          break
        }
        case 'set': {
          const { name, value, duration } = message.payload
          const result = store.set(name, value, duration)
          ws.send(JSON.stringify({ type: 'set_result', payload: result }))
          break
        }
      }
    }
    catch (err) {
      console.error('[expression-api] WebSocket message error:', err)
    }
  })

  ws.on('close', () => {
    console.log('[expression-api] WebSocket client disconnected')
  })
})

// Handle WebSocket upgrade
app.get('/ws/expressions', (c) => {
  // Hono doesn't handle WebSocket upgrade directly
  // We handle it in the server startup
  return c.body(null)
})

// ---- Server Startup --------------------------------------------------------

export async function startServer(port: number = 3100) {
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: '127.0.0.1',
  })

  // Handle WebSocket upgrade
  server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
    const url = new URL(request.url || '', `http://localhost:${port}`)
    if (url.pathname === '/ws/expressions') {
      wss.handleUpgrade(request, socket, head, (ws: any) => {
        wss.emit('connection', ws, request)
      })
    }
  })

  console.log(`[expression-api] Server running at http://127.0.0.1:${port}`)
  console.log(`[expression-api] WebSocket endpoint: ws://127.0.0.1:${port}/ws/expressions`)
  console.log(`[expression-api] HTTP API endpoints:`)
  console.log(`  GET  /api/expressions          - Get all expression states`)
  console.log(`  POST /api/expressions/set      - Set an expression`)
  console.log(`  POST /api/expressions/toggle   - Toggle an expression`)
  console.log(`  POST /api/expressions/reset    - Reset all expressions`)
  console.log(`  POST /api/expressions/save-defaults - Save defaults`)
  console.log(`  GET  /api/expressions/names    - Get available expression names`)
  console.log(`  GET  /api/expressions/model    - Get current model ID`)

  return { server, store }
}

// ---- CLI Entry Point -------------------------------------------------------
if (import.meta.url.endsWith('server.ts')) {
  startServer().catch(console.error)
}
