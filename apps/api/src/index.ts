import { createApiRuntime } from "./runtime/composition-root.js";
import { startServer } from "./runtime/server.js";

const runtime = await createApiRuntime();
const runningServer = await startServer(runtime);

console.log(`ASR Huddle API listening on http://localhost:${runtime.config.port}`);

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down.`);

  try {
    await runningServer.close();
    await runtime.close();
  } catch (error) {
    console.error("Shutdown failed.", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
