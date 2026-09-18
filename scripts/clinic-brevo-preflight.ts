type ProviderEvidence = Record<string, any>;
export function evaluateBrevoPreflight(input: { smtpAuthentication: boolean; smtpTransportReady: boolean; senderConfigured: boolean; directFragment: boolean; localTrackingDeclaration: boolean; deliveryGate: string; provider?: ProviderEvidence }) {
  const evidence = input.provider || {};
  const trusted = evidence.source === 'authenticated_provider_browser_read_only' && evidence.configuredFromExactMatch === true && evidence.smtpLoginExactMatch === true && evidence.stagingKeyMaskedSuffixMatch === true;
  const strictBoolean = (key: string) => trusted && typeof evidence[key] === 'boolean' ? evidence[key] : 'UNKNOWN';
  const senderProviderVerified = trusted && typeof evidence.senderProviderVerified === 'boolean' ? evidence.senderProviderVerified : 'MANUAL';
  const providerScopeIsolated = strictBoolean('providerScopeIsolated');
  const sharedProviderAccepted = trusted && evidence.providerScope === 'SHARED' && evidence.sharedProviderAccepted === true;
  const openTrackingDisabled = strictBoolean('openTrackingDisabled');
  const clickTrackingDisabled = strictBoolean('clickTrackingDisabled');
  const linkRewritingDisabled = strictBoolean('linkRewritingDisabled');
  const providerScope = trusted && typeof evidence.providerScope === 'string' ? evidence.providerScope : providerScopeIsolated === true ? 'ISOLATED' : providerScopeIsolated === false ? 'SHARED' : 'UNKNOWN';
  const declaredStrictTrackingDisable = trusted && typeof evidence.strictTrackingDisable === 'string' ? evidence.strictTrackingDisable : undefined;
  const strictTrackingDisable = openTrackingDisabled === true && clickTrackingDisabled === true && linkRewritingDisabled === true && (declaredStrictTrackingDisable === undefined || declaredStrictTrackingDisable === 'VERIFIED') ? 'VERIFIED' : declaredStrictTrackingDisable === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'UNPROVEN';
  const complete = input.smtpAuthentication && input.smtpTransportReady && input.senderConfigured && senderProviderVerified === true && providerScopeIsolated === true && providerScope === 'ISOLATED' && strictTrackingDisable === 'VERIFIED' && input.directFragment && input.localTrackingDeclaration && input.deliveryGate === 'OFF';
  const providerIsolationStatus = trusted && typeof evidence.providerIsolationStatus === 'string' ? evidence.providerIsolationStatus : providerScope === 'SHARED' ? 'MANUAL_PROVIDER_GATE' : 'UNKNOWN';
  const status = !input.smtpAuthentication || !input.senderConfigured || !input.directFragment || input.deliveryGate === 'ON' ? 'FAIL' : complete ? 'PASS' : providerIsolationStatus === 'PLAN_CAPABILITY_GATE' ? 'PLAN_CAPABILITY_GATE' : 'MANUAL_PROVIDER_GATE';
  return {
    status,
    accountType: trusted ? evidence.accountType || 'UNKNOWN' : 'UNKNOWN',
    plan: trusted ? evidence.plan || 'UNKNOWN' : 'UNKNOWN',
    planCapability: trusted ? evidence.planCapability || 'UNKNOWN' : 'UNKNOWN',
    subaccountsSupported: trusted && typeof evidence.subaccountsSupported === 'boolean' ? evidence.subaccountsSupported : 'UNKNOWN',
    subaccountsAvailable: trusted ? evidence.subaccountsAvailable ?? 'UNKNOWN' : 'UNKNOWN',
    existingSubaccounts: trusted ? evidence.existingSubaccounts || [] : [],
    providerIsolationStatus,
    sharedProviderAccepted,
    environmentIdentification: input.directFragment ? 'PASS' : 'FAIL',
    providerEntity: trusted ? evidence.providerEntity || 'UNKNOWN' : 'UNKNOWN',
    smtpAuthentication: input.smtpAuthentication, smtpTransportReady: input.smtpTransportReady, senderConfigured: input.senderConfigured,
    senderProviderVerified, sender: senderProviderVerified === true ? 'VERIFIED' : senderProviderVerified === false ? 'FAIL' : 'MANUAL_GATE',
    senderScope: trusted ? evidence.senderScope || 'UNKNOWN' : 'UNKNOWN',
    domainAuthenticated: strictBoolean('domainAuthenticated'),
    providerScopeIsolated, providerScope,
    smtpCredentialScope: trusted ? evidence.smtpCredentialScope || 'UNKNOWN' : 'UNKNOWN',
    trackingConfigurationScope: trusted ? evidence.trackingConfigurationScope || 'UNKNOWN' : 'UNKNOWN',
    trackingPolicyKnown: trusted && evidence.trackingPolicyKnown === true,
    anonymousTracking: strictBoolean('anonymousTracking'),
    perContactTrackingConsent: trusted ? evidence.perContactTrackingConsent || 'UNAVAILABLE' : 'UNKNOWN',
    trackUnknownContacts: trusted ? evidence.trackUnknownContacts || 'UNAVAILABLE' : 'UNKNOWN',
    openTrackingDisabled, clickTrackingDisabled, linkRewritingDisabled,
    strictOpenTrackingDisabled: strictTrackingDisable === 'VERIFIED' ? 'VERIFIED' : 'UNPROVEN',
    strictClickTrackingDisabled: strictTrackingDisable === 'VERIFIED' ? 'VERIFIED' : 'UNPROVEN',
    strictTrackingDisable,
    linkRewriting: trusted ? evidence.linkRewriting || 'UNKNOWN' : 'UNKNOWN',
    smtpMessageOverrideVerified: trusted && evidence.smtpMessageOverrideVerified === true,
    directFragment: input.directFragment, localTrackingDeclaration: input.localTrackingDeclaration,
    deliveryGate: input.deliveryGate, sendAttempted: false,
    realControlledDelivery: 'PENDING_EXPLICIT_RECIPIENT_AUTHORIZATION',
    controlledDeliveryRequired: true,
    dnsChanged: false,
    billingPlanChanged: false,
    providerConfigurationChanged: false,
    limitations: trusted ? evidence.limitations || [] : ['No provider evidence bound to the configured staging SMTP sender/account.'],
  };
}
