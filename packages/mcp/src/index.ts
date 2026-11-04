/**
 * `@goflag/mcp` — goflag as an MCP server.
 *
 *   import { createGoflagServer } from "@goflag/mcp";
 *   await createGoflagServer().connect(transport);
 *
 * The `goflag-mcp` binary does exactly that over stdio; this export is for a
 * host that brings its own transport.
 */
export { createGoflagServer } from "./server";
