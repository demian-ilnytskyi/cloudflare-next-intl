'use client';
import { useEffect } from 'react';
import reportError from '../../../error_handling/report_error.js';
let cachedClarityModule;
function getClarityModule() {
    if (!cachedClarityModule) {
        cachedClarityModule = import('@microsoft/clarity');
    }
    return cachedClarityModule;
}
export default function ClarityScript({ projectId }) {
    useEffect(() => {
        getClarityModule()
            .then(({ default: Clarity }) => {
            Clarity.init(projectId);
            Clarity.consent();
        })
            .catch((error) => void reportError(undefined, {
            error,
            classOrMethodName: 'ClarityScript',
            isClient: true,
        }));
    }, [projectId]);
    return null;
}
