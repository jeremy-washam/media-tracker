import process from 'node:process'
import { runDeployment } from './deployment.js'

const help = `Imladris CLI

Generalized import, replay, export, and recovery commands are not implemented.
Use Connections or the HTTP API for source imports and resumable processing.
See apps/api/README.md for current endpoints and README.md for database upgrades.`

if (process.argv[2] === 'deployment') {
  try {
    runDeployment(process.argv.slice(3))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Deployment preparation failed')
    process.exitCode = 1
  }
} else console.log(help)
