export default function requireFirebaseAuthConfig(fa) {
    if (!fa) {
        throw new Error('firebase_auth: `firebaseAuth` is not set on your RoutingConfig. ' +
            'Add a `firebaseAuth` object (Firebase project config + route config) ' +
            'to the config passed to `setIntlConfig` before using any firebase_auth export.');
    }
}
