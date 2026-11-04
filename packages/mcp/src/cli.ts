/**
 * `goflag-mcp`: the server over stdio, which is how an MCP client spawns it.
 *
 * stdout carries the protocol and nothing else — the audit engine writes
 * nowhere, and nothing here may either. A diagnostic goes to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createGoflagServer } from "./server";

try {
  await createGoflagServer().connect(new StdioServerTransport());
} catch (err) {
  process.stderr.write(`goflag-mcp: ${(err as Error).message}\n`);
  process.exit(1);
}
