import http from 'http'
import { Server } from 'socket.io'

const PORT = Number(process.env.SOCKET_PORT || 3003)

// Raw HTTP endpoint so Next.js API routes can broadcast internally via POST /emit
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && (req.url === '/emit' || req.url?.startsWith('/emit?'))) {
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
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

io.on('connection', (socket) => {
  socket.join('game')
  socket.emit('sync', { kind: 'WEEK', message: 'Connected to the Brotherhood live feed.' })
})

httpServer.listen(PORT, () => {
  console.log(`game-socket service listening on :${PORT}`)
})
