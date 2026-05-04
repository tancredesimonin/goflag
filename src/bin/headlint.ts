#!/usr/bin/env node
import { runCli } from "../lib/cli/program";

runCli(process.argv.slice(2)).then((code) => {
  process.exit(code);
});
