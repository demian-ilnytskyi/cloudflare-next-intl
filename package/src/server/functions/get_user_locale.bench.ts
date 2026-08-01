import { bench, describe } from 'vitest';
import { languageDetecotr } from './get_user_locale';

describe('languageDetecotr', () => {
    bench('single locale header', () => {
        languageDetecotr('en');
    });

    bench('realistic multi-entry Accept-Language header', () => {
        languageDetecotr('fr-CA,fr;q=0.9,en-US;q=0.8,en;q=0.7,de;q=0.6,es;q=0.5');
    });

    bench('no header (default-locale fallback)', () => {
        languageDetecotr(null);
    });
});
