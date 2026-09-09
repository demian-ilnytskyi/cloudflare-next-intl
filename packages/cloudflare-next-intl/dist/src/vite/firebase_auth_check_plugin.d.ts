import type { Plugin } from "vite";
import { type CheckFirebaseAuthConfigOptions } from "../firebase_auth_check/index.js";
export interface FirebaseAuthCheckPluginOptions extends Pick<CheckFirebaseAuthConfigOptions, "intlConfigPath" | "env"> {
    strict?: boolean;
    runOnDev?: boolean;
}
export declare function firebaseAuthCheckPlugin(options?: FirebaseAuthCheckPluginOptions): Plugin;
