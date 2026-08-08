import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools.js'

// Serveur MCP Cadence (Phase 5, roadmap v1, 2026-08-08) : transport stdio, adapté à un client MCP
// local (Claude Desktop, Claude Code) qui lance ce process lui-même, un par utilisateur/poste.
// Voir README.md pour la configuration (CADENCE_API_URL/CADENCE_API_TOKEN) et cadenceClient.ts
// pour la vérification du jeton (faite entièrement côté backend Cadence, jamais ici).
const server = new McpServer({ name: 'cadence-mcp', version: '0.1.0' })

registerTools(server)

const transport = new StdioServerTransport()
await server.connect(transport)
