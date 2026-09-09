import { checkFirebaseAuthConfig } from "../firebase_auth_check/index.js";
import { resolveDefaultIntlConfigPath } from "./locale_file_plugin.js";
export function firebaseAuthCheckPlugin(options = {}) {
    let ran = false;
    return {
        name: "cloudflare-next-intl-firebase-auth-check",
        enforce: "pre",
        async configResolved(config) {
            if (ran)
                return;
            const isBuild = config.command === "build";
            const isDev = config.command === "serve";
            if (!isBuild && !(isDev && (options.runOnDev ?? true)))
                return;
            ran = true;
            const root = config.root || process.cwd();
            const intlConfigPath = options.intlConfigPath ?? resolveDefaultIntlConfigPath(root);
            let env = options.env;
            if (!env) {
                const { loadEnv } = await import("vite");
                env = {
                    ...loadEnv(config.mode, config.envDir || root, ""),
                    ...process.env,
                };
            }
            const report = checkFirebaseAuthConfig({ intlConfigPath, env, throwOnError: false });
            if (report.issues.length === 0)
                return;
            console.warn(report.formattedMessage);
            if (!report.valid && options.strict) {
                throw new Error("[cloudflare-next-intl] Build failed: `firebaseAuth` config is incomplete. See details above.");
            }
        },
    };
}
