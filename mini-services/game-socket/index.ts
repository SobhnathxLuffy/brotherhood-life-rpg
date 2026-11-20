import http from 'http'
import { Server } from 'socket.io'

const PORT = Number(process.env.SOCKET_PORT || 3003)
const EMIT_TOKEN = process.env.EMIT_TOKEN || 'brotherhood-emit-local'

// Raw HTTP endpoint so Next.js API routes can broadcast internally via POST /emit.
// Guarded by a shared token (x-emit-token); CORS echoes the request origin
// instead of `*` (the app is same-origin behind Caddy anyway).
const httpServer = http.createServer((req, res) => {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-emit-token')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && (req.url === '/emit' || req.url?.startsWith('/emit?'))) {
    const header = req.headers['x-emit-token']
    const token = Array.isArray(header) ? header[0] : header
    if (!token || token !== EMIT_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end('{"error":"unauthorized"}')
      return
    }
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        const ev = JSON.parse(body)
        io.to('game').emit('sync', ev)
      } catch {
        // ignore malformed payloads
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
    return
  }

  res.writeHead(404)
  res.end()
})

const io = new Server(httpServer, {
  // reflect the browser origin so the existing socket.io client path keeps working
  cors: { origin: true, methods: ['GET', 'POST'] },
})

io.on('connection', (socket) => {
  socket.join('game')
  socket.emit('sync', { kind: 'WEEK', message: 'Connected to the Brotherhood live feed.' })
})

httpServer.listen(PORT, () => {
  console.log(`game-socket service listening on :${PORT}`)
})
