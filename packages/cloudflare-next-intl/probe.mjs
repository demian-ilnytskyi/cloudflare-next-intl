import { createServer } from "vite";
try {
  const server = await createServer({
    configFile: false,
    root: "\0invalid-null-byte-root",
    envDir: "/path/to/nonexistent",
    mode: "development",
    resolve: { alias: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    logLevel: "silent",
    clearScreen: false,
  });
  console.log("server created", !!server);
} catch (e) {
  console.log("threw:", e.message);
}
