import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLayoutQueries, findLayoutFiles, formatLayoutDbViolationMessage } from "./check_layout_queries.js";

describe("checkLayoutQueries", () => {
  it("passes when layout contains only clean server/client components", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-clean-"));
    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import Header from "./header";\nexport default function Layout({ children }) { return <div><Header />{children}</div>; }`
      );
      writeFileSync(
        join(appDir, "header.tsx"),
        `export default function Header() { return <header>Clean</header>; }`
      );

      const report = checkLayoutQueries({
        appDir,
        rootDir: tempDir,
      });

      expect(report.valid).toBe(true);
      expect(report.violations).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("flags blocking withUserDb() in layout dependency tree", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-db-"));
    try {
      const appDir = join(tempDir, "src", "app");
      const sharedDir = join(tempDir, "src", "shared");
      mkdirSync(appDir, { recursive: true });
      mkdirSync(sharedDir, { recursive: true });

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import NotificationBell from "@/shared/bell";\nexport default function Layout({ children }) { return <div><NotificationBell />{children}</div>; }`
      );
      writeFileSync(
        join(sharedDir, "bell.tsx"),
        `import { countUnread } from "./repo";\nexport default async function NotificationBell() { await countUnread(); return <div />; }`
      );
      writeFileSync(
        join(sharedDir, "repo.ts"),
        `import { withUserDb } from "cloudflare-next-intl/db";\nexport async function countUnread() { return await withUserDb((db) => db.select()); }`
      );

      const report = checkLayoutQueries({
        appDir,
        rootDir: tempDir,
        aliases: { "@": join(tempDir, "src") },
      });

      expect(report.valid).toBe(false);
      expect(report.violations).toHaveLength(1);
      expect(report.violations[0]?.signal).toBe("withUserDb()");
      expect(report.violations[0]?.sourceFile).toContain("repo.ts");
      expect(report.formattedMessage).toContain("BLOCKING DATABASE QUERY DETECTED IN LAYOUT");
      expect(report.formattedMessage).toContain("HOW TO FIX");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not flag withUserDb() if component is a Client Component ('use client')", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-client-"));
    try {
      const appDir = join(tempDir, "src", "app");
      const sharedDir = join(tempDir, "src", "shared");
      mkdirSync(appDir, { recursive: true });
      mkdirSync(sharedDir, { recursive: true });

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import ClientBell from "@/shared/client_bell";\nexport default function Layout({ children }) { return <div><ClientBell />{children}</div>; }`
      );
      writeFileSync(
        join(sharedDir, "client_bell.tsx"),
        `"use client";\nimport { useEffect } from "react";\nexport default function ClientBell() { return <div>Client Bell</div>; }`
      );

      const report = checkLayoutQueries({
        appDir,
        rootDir: tempDir,
        aliases: { "@": join(tempDir, "src") },
      });

      expect(report.valid).toBe(true);
      expect(report.violations).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("throws with clear instruction message when throwOnError is true", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-throw-"));
    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import { withPublicDb } from "cloudflare-next-intl/db";\nexport default async function Layout({ children }) { await withPublicDb(db => db); return <div>{children}</div>; }`
      );

      expect(() =>
        checkLayoutQueries({
          appDir,
          rootDir: tempDir,
          throwOnError: true,
        })
      ).toThrow("BLOCKING DATABASE QUERY DETECTED IN LAYOUT");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns an empty message and no violations when there is nothing to report", () => {
    expect(formatLayoutDbViolationMessage([])).toBe("");
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-empty-"));
    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });
      const report = checkLayoutQueries({ appDir, rootDir: tempDir });
      expect(report.valid).toBe(true);
      expect(report.formattedMessage).toBe("");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns an empty array when the app directory does not exist", () => {
    expect(findLayoutFiles(join(tmpdir(), "does-not-exist-" + Date.now()))).toEqual([]);
  });

  it("finds nested layout files by recursing into subdirectories, skipping dotfiles and node_modules", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-nested-"));
    try {
      const appDir = join(tempDir, "src", "app");
      const nestedDir = join(appDir, "(app)", "dashboard");
      mkdirSync(nestedDir, { recursive: true });
      mkdirSync(join(appDir, ".hidden"), { recursive: true });
      mkdirSync(join(appDir, "node_modules"), { recursive: true });
      writeFileSync(join(appDir, ".hidden", "layout.tsx"), `export default function L() { return null; }`);
      writeFileSync(join(appDir, "node_modules", "layout.tsx"), `export default function L() { return null; }`);
      writeFileSync(join(nestedDir, "layout.tsx"), `export default function L() { return null; }`);

      const found = findLayoutFiles(appDir);
      expect(found).toHaveLength(1);
      expect(found[0]).toContain(join("(app)", "dashboard", "layout.tsx"));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves an aliased import to an index file inside a directory", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-index-"));
    try {
      const appDir = join(tempDir, "src", "app");
      const sharedDir = join(tempDir, "src", "shared", "bell");
      mkdirSync(appDir, { recursive: true });
      mkdirSync(sharedDir, { recursive: true });

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import Bell from "@/shared/bell";\nexport default function Layout({ children }) { return <div><Bell />{children}</div>; }`
      );
      writeFileSync(
        join(sharedDir, "index.ts"),
        `import { withPublicDb } from "cloudflare-next-intl/db";\nexport default async function Bell() { await withPublicDb((db) => db); return null; }`
      );

      const report = checkLayoutQueries({
        appDir,
        rootDir: tempDir,
        aliases: { "@": join(tempDir, "src") },
      });

      expect(report.valid).toBe(false);
      expect(report.violations[0]?.sourceFile).toContain(join("bell", "index.ts"));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not flag a signal appearing inside a comment line", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-comment-"));
    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });

      writeFileSync(
        join(appDir, "layout.tsx"),
        [
          `// withUserDb() mentioned only in a comment`,
          `/* withUserDb() also here */`,
          ` * withUserDb() and here too`,
          `export default function Layout({ children }) { return <div>{children}</div>; }`,
        ].join("\n")
      );

      const report = checkLayoutQueries({ appDir, rootDir: tempDir });
      expect(report.valid).toBe(true);
      expect(report.violations).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("stops traversing once a file has already been visited, and silently skips an unreadable import target", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-cycle-"));
    try {
      const appDir = join(tempDir, "src", "app");
      const sharedDir = join(tempDir, "src", "shared");
      mkdirSync(appDir, { recursive: true });
      mkdirSync(sharedDir, { recursive: true });

      // a.ts and b.ts import each other (cycle) — traversal must terminate via `visited`.
      writeFileSync(
        join(sharedDir, "a.ts"),
        `import { withUserDb } from "cloudflare-next-intl/db";\nimport "./b.js";\nexport async function a() { return await withUserDb((db) => db); }`
      );
      writeFileSync(join(sharedDir, "b.ts"), `import "./a.js";\nexport const b = 1;`);

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import "@/shared/a";\nexport default function Layout({ children }) { return <div>{children}</div>; }`
      );

      const report = checkLayoutQueries({
        appDir,
        rootDir: tempDir,
        aliases: { "@": join(tempDir, "src") },
      });

      expect(report.violations).toHaveLength(1);
      expect(report.violations[0]?.sourceFile).toContain("a.ts");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("stops descending once maxDepth is exceeded", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-maxdepth-"));
    try {
      const appDir = join(tempDir, "src", "app");
      const sharedDir = join(tempDir, "src", "shared");
      mkdirSync(appDir, { recursive: true });
      mkdirSync(sharedDir, { recursive: true });

      writeFileSync(join(sharedDir, "deep.ts"), `import { withUserDb } from "cloudflare-next-intl/db";\nexport async function deep() { return await withUserDb((db) => db); }`);
      writeFileSync(
        join(appDir, "layout.tsx"),
        `import "@/shared/deep";\nexport default function Layout({ children }) { return <div>{children}</div>; }`
      );

      const report = checkLayoutQueries({
        appDir,
        rootDir: tempDir,
        aliases: { "@": join(tempDir, "src") },
        maxDepth: 0,
      });

      expect(report.valid).toBe(true);
      expect(report.violations).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves an import specifier that already includes its extension directly", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-explicitext-"));
    try {
      const appDir = join(tempDir, "src", "app");
      const sharedDir = join(tempDir, "src", "shared");
      mkdirSync(appDir, { recursive: true });
      mkdirSync(sharedDir, { recursive: true });

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import "@/shared/bell.tsx";\nexport default function Layout({ children }) { return <div>{children}</div>; }`
      );
      writeFileSync(
        join(sharedDir, "bell.tsx"),
        `import { withUserDb } from "cloudflare-next-intl/db";\nexport async function Bell() { return await withUserDb((db) => db); }`
      );

      const report = checkLayoutQueries({
        appDir,
        rootDir: tempDir,
        aliases: { "@": join(tempDir, "src") },
      });

      expect(report.valid).toBe(false);
      expect(report.violations[0]?.sourceFile).toContain("bell.tsx");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("silently skips an import target file that exists but cannot be read", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-unreadable-"));
    try {
      const appDir = join(tempDir, "src", "app");
      const sharedDir = join(tempDir, "src", "shared");
      mkdirSync(appDir, { recursive: true });
      mkdirSync(sharedDir, { recursive: true });

      const unreadableFile = join(sharedDir, "unreadable.ts");
      writeFileSync(unreadableFile, `export const x = 1;`);
      chmodSync(unreadableFile, 0o000);

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import "@/shared/unreadable";\nexport default function Layout({ children }) { return <div>{children}</div>; }`
      );

      try {
        const report = checkLayoutQueries({
          appDir,
          rootDir: tempDir,
          aliases: { "@": join(tempDir, "src") },
        });
        expect(report.valid).toBe(true);
      } finally {
        chmodSync(unreadableFile, 0o644);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("defaults rootDir to process.cwd() and appDir to <rootDir>/src/app when omitted", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-defaults-"));
    const originalCwd = process.cwd();
    try {
      mkdirSync(join(tempDir, "src", "app"), { recursive: true });
      process.chdir(tempDir);
      const report = checkLayoutQueries();
      expect(report.valid).toBe(true);
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not treat an unrelated bare specifier as a resolvable import", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "check-layout-bare-"));
    try {
      const appDir = join(tempDir, "src", "app");
      mkdirSync(appDir, { recursive: true });

      writeFileSync(
        join(appDir, "layout.tsx"),
        `import React from "react";\nexport default function Layout({ children }) { return <div>{children}</div>; }`
      );

      const report = checkLayoutQueries({ appDir, rootDir: tempDir });
      expect(report.valid).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
