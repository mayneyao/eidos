#!/usr/bin/env node

import { runExtensionCli } from "./command"

process.exitCode = await runExtensionCli(process.argv.slice(2))
