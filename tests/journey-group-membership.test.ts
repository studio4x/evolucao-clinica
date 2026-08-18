import assert from "node:assert/strict";
import { checkJourneyGroupMembership, JourneyGroupMembershipError } from "../server/whatsapp/journeyGroupMembership.js";

const requests: Array<{ url: string; init?: RequestInit }> = [];
const fakeFetch = (payload: Record<string, unknown>, status = 200) => {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
};

const baseInput = {
  webhookUrl: "https://webhook.studio4x.com.br/webhook/evolucao-clinica/admin/jornada/verificar-membro",
  webhookToken: "token-de-teste",
  professionalId: "professional-1",
  phoneNumber: "5511999999999"
};

const memberResult = await checkJourneyGroupMembership({
  ...baseInput,
  fetchImpl: fakeFetch({
    ok: true,
    status: "member",
    member: true,
    professionalId: "professional-1",
    participantCount: 23,
    checkedAt: "2026-08-18T14:31:45.408Z"
  })
});
assert.equal(memberResult.status, "member");
assert.equal(memberResult.member, true);
assert.equal(memberResult.participantCount, 23);
assert.equal(requests[0]?.init?.headers && (requests[0].init.headers as Record<string, string>).Authorization, "Bearer token-de-teste");
assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
  professionalId: "professional-1",
  phoneNumber: "5511999999999"
});

const notMemberResult = await checkJourneyGroupMembership({
  ...baseInput,
  fetchImpl: fakeFetch({
    ok: true,
    status: "not_member",
    member: false,
    professionalId: "professional-1",
    participantCount: 23,
    checkedAt: "2026-08-18T14:35:30.191Z"
  })
});
assert.equal(notMemberResult.status, "not_member");
assert.equal(notMemberResult.member, false);

await assert.rejects(
  () => checkJourneyGroupMembership({
    ...baseInput,
    fetchImpl: fakeFetch({ ok: false, status: "indeterminate", member: null, error: "evolution_api_http_error" }, 502)
  }),
  (error: unknown) => error instanceof JourneyGroupMembershipError
    && error.statusCode === 502
    && error.code === "evolution_api_http_error"
);

await assert.rejects(
  () => checkJourneyGroupMembership({
    ...baseInput,
    webhookToken: "",
    fetchImpl: fakeFetch({ ok: true, status: "member", member: true })
  }),
  (error: unknown) => error instanceof JourneyGroupMembershipError
    && error.statusCode === 503
    && error.code === "webhook_token_not_configured"
);

console.log("Journey group membership tests passed.");
