export interface LocaleParamsDetectionResult {
    hasInlineDestructure: boolean;
    hasSetLocaleCall: boolean;
    hasLocaleParamSetup: boolean;
    hasParamsType: boolean;
    hasDestructuredParamsProp: boolean;
    hasConflictingLocaleBinding: boolean;
    hasDestructuredObjectWithoutParams: boolean;
}
export declare function detectLocaleParams(sourceText: string, localeParam: string): LocaleParamsDetectionResult;
