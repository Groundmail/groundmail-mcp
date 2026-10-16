import { parseCliArgs, printHelp } from './cli.js'
import { runHttpServer } from './http.js'
import { runStdioServer } from './server.js'

async function main() {
  const options = parseCliArgs(process.argv)
  if (options.mode === 'help') {
    printHelp()
    process.exit(0)
  }
  if (options.mode === 'http') {
    await runHttpServer({ port: options.port, host: options.host })
    return
  }
  await runStdioServer()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
