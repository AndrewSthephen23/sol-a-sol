import process from 'node:process';

import { run } from './cli.js';

process.exitCode = await run(process.argv.slice(2));
