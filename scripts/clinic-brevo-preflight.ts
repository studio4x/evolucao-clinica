type ProviderEvidence = Record<string, any>;
export function evaluateBrevoPreflight(input: { smtpAuthentication: boolean; senderConfigured: boolean; directFragment: boolean; localTrackingDeclaration: boolean; deliveryGate: string; provider?: ProviderEvidence }) {
  const evidence = input.provider || {};
  const trusted = evidence.source === 'authenticated_provider_browser_read_only' && evidence.configuredFromExactMatch === true && evidence.smtpLoginExactMatch === true && evidence.stagingKeyMaskedSuffixMatch === true;
  const strictBoolean = (key: string) => trusted && typeof evidence[key] === 'boolean' ? evidence[key] : 'UNKNOWN';
  const senderProviderVerified = trusted && typeof evidence.senderProviderVerified === 'boolean' ? evidence.senderProviderVerified : 'MANUAL';
  const providerScopeIsolated = strictBoolean('providerScopeIsolated');
  const openTrackingDisabled = strictBoolean('openTrackingDisabled');
  const clickTrackingDisabled = strictBoolean('clickTrackingDisabled');
  const linkRewritingDisabled = strictBoolean('linkRewritingDisabled');
  const complete = input.smtpAuthentication && input.senderConfigured && senderProviderVerified === true && providerScopeIsolated === true && openTrackingDisabled === true && clickTrackingDisabled === true && linkRewritingDisabled === true && input.directFragment && input.localTrackingDeclaration && input.deliveryGate === 'OFF';
  return {
    status: !input.smtpAuthentication || !input.senderConfigured || !input.directFragment || input.deliveryGate === 'ON' ? 'FAIL' : complete ? 'PASS' : 'MANUAL_PROVIDER_GATE',
    smtpAuthentication: input.smtpAuthentication, senderConfigured: input.senderConfigured,
    senderProviderVerified, domainAuthenticated: strictBoolean('domainAuthenticated'),
    providerScopeIsolated, providerScope: providerScopeIsolated === true ? 'ISOLATED' : providerScopeIsolated === false ? 'SHARED' : 'UNKNOWN',
    trackingPolicyKnown: trusted && evidence.trackingPolicyKnown === true,
    anonymousTracking: strictBoolean('anonymousTracking'),
    openTrackingDisabled, clickTrackingDisabled, linkRewritingDisabled,
    smtpMessageOverrideVerified: trusted && evidence.smtpMessageOverrideVerified === true,
    directFragment: input.directFragment, localTrackingDeclaration: input.localTrackingDeclaration,
    deliveryGate: input.deliveryGate, sendAttempted: false,
    realControlledDelivery: 'PENDING_EXPLICIT_RECIPIENT_AUTHORIZATION',
    providerConfigurationChanged: false,
    limitations: trusted ? evidence.limitations || [] : ['No provider evidence bound to the configured staging SMTP sender/account.'],
  };
}
