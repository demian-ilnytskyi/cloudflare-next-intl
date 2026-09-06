import { describe, expect, it, vi } from "vitest";
import { layoutQueriesPlugin } from "./layout_queries_plugin.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedConfig } from "vite";

describe("layoutQueriesPlugin", () => {
  it("runs during configResolved and warns on layout DB violations", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "vite-layout-test-"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import { withUserDb } from "cloudflare-next-intl/db";\nexport default function Layout() { withUserDb(); return null; }`
      );

      const plugin = layoutQueriesPlugin({ runOnDev: true });
      const config = {
        command: "build",
        root: tempDir,
      } as ResolvedConfig;

      if (typeof plugin.configResolved === "function") {
        (plugin.configResolved as any)(config);
      }

      expect(consoleWarnSpy).toHaveBeenCalled();
      const output = consoleWarnSpy.mock.calls.flat().join(" ");
      expect(output).toContain("BLOCKING DATABASE QUERY DETECTED IN LAYOUT");
    } finally {
      consoleWarnSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("throws in strict mode when violations exist", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "vite-layout-strict-"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import { withUserDb } from "cloudflare-next-intl/db";\nexport default function Layout() { withUserDb(); return null; }`
      );

      const plugin = layoutQueriesPlugin({ strict: true });
      const config = {
        command: "build",
        root: tempDir,
      } as ResolvedConfig;

      expect(() => {
        if (typeof plugin.configResolved === "function") {
          (plugin.configResolved as any)(config);
        }
      }).toThrow("Blocking database queries detected in layout tree");
    } finally {
      consoleWarnSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not warn when no violations are found", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "vite-layout-clean-"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(join(appDir, "layout.tsx"), `export default function Layout() { return null; }`);

      const plugin = layoutQueriesPlugin();
      const config = { command: "build", root: tempDir } as ResolvedConfig;
      (plugin.configResolved as any)(config);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("only runs once even if configResolved is called again", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "vite-layout-once-"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(
        join(appDir, "layout.tsx"),
        `import { withUserDb } from "cloudflare-next-intl/db";\nexport default function Layout() { withUserDb(); return null; }`
      );

      const plugin = layoutQueriesPlugin();
      const config = { command: "build", root: tempDir } as ResolvedConfig;
      (plugin.configResolved as any)(config);
      (plugin.configResolved as any)(config);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    } finally {
      consoleWarnSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("skips the check on dev when runOnDev is false", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "vite-layout-nodev-"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(
        join(appDir, "layout.tsx"),
        `import { withUserDb } from "cloudflare-next-intl/db";\nexport default function Layout() { withUserDb(); return null; }`
      );

      const plugin = layoutQueriesPlugin({ runOnDev: false });
      const config = { command: "serve", root: tempDir } as ResolvedConfig;
      (plugin.configResolved as any)(config);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("runs the check on dev by default (runOnDev defaults to true)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "vite-layout-dev-"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(
        join(appDir, "layout.tsx"),
        `import { withUserDb } from "cloudflare-next-intl/db";\nexport default function Layout() { withUserDb(); return null; }`
      );

      const plugin = layoutQueriesPlugin();
      const config = { command: "serve", root: tempDir } as ResolvedConfig;
      (plugin.configResolved as any)(config);

      expect(consoleWarnSpy).toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("skips entirely for a command that is neither build nor serve", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "vite-layout-othercmd-"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(
        join(appDir, "layout.tsx"),
        `import { withUserDb } from "cloudflare-next-intl/db";\nexport default function Layout() { withUserDb(); return null; }`
      );

      const plugin = layoutQueriesPlugin();
      const config = { command: "watch", root: tempDir } as unknown as ResolvedConfig;
      (plugin.configResolved as any)(config);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("falls back to process.cwd() when config.root is falsy", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const originalCwd = process.cwd();
    const tempDir = mkdtempSync(join(tmpdir(), "vite-layout-cwd-"));

    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(join(appDir, "layout.tsx"), `export default function Layout() { return null; }`);

      process.chdir(tempDir);
      const plugin = layoutQueriesPlugin();
      const config = { command: "build", root: "" } as unknown as ResolvedConfig;
      (plugin.configResolved as any)(config);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
      consoleWarnSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns without running when no app directory can be found", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "vite-layout-noappdir-"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const plugin = layoutQueriesPlugin();
      const config = { command: "build", root: tempDir } as ResolvedConfig;
      (plugin.configResolved as any)(config);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses an explicit appDir option over the src/app and app conventions", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "vite-layout-explicit-"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const customAppDir = join(tempDir, "custom", "app");
      mkdirSync(customAppDir, { recursive: true });
      writeFileSync(
        join(customAppDir, "layout.tsx"),
        `import { withUserDb } from "cloudflare-next-intl/db";\nexport default function Layout() { withUserDb(); return null; }`
      );

      const plugin = layoutQueriesPlugin({ appDir: customAppDir });
      const config = { command: "build", root: tempDir } as ResolvedConfig;
      (plugin.configResolved as any)(config);

      expect(consoleWarnSpy).toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
