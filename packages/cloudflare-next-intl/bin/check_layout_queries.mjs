#!/usr/bin/env node
import { checkLayoutQueries } from "../dist/src/layout_queries_check/index.js";

const isStrict = process.argv.includes("--strict");
const report = checkLayoutQueries({
  rootDir: process.cwd(),
});

if (!report.valid) {
  console.error(report.formattedMessage);
  if (isStrict) {
    process.exit(1);
  }
} else {
  console.log("✅ [cloudflare-next-intl] No blocking database queries found in layout tree.");
}
