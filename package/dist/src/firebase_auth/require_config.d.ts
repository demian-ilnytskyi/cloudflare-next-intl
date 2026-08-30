import type { FirebaseAuthRoutingConfig } from '../types/types.js';
export default function requireFirebaseAuthConfig(fa: FirebaseAuthRoutingConfig | undefined): asserts fa is FirebaseAuthRoutingConfig;
