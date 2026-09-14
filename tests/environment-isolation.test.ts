import assert from "node:assert/strict";
import {
  assertIntegrationEnabled,
  loadIntegrationFlags,
  validateSupabaseEnvironmentBinding,
} from "../src/config/environment.js";
import { loadServerEnvironment } from "../server/config/environment.js";

const productionRef = "abcdefghijklmnopqrst";
const stagingRef = "uvwxyzabcdefghijklmn";
const baseServerEnv = {
  APP_ENV: "production",
  VITE_APP_ENV: "production",
  VITE_SUPABASE_URL: `https://${productionRef}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_value",
  EXPECTED_SUPABASE_PROJECT_REF: productionRef,
  PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
  PUBLIC_APP_URL: "https://www.example.com",
  PRODUCTION_APP_ORIGIN: "https://www.example.com",
  CRON_JOBS_ENABLED: "false",
  WHATSAPP_SEND_ENABLED: "false",
};

assert.throws(
  () => validateSupabaseEnvironmentBinding({
    appEnv: "staging",
    url: `https://${productionRef}.supabase.co`,
    key: "anon-test",
    expectedProjectRef: productionRef,
    productionProjectRef: productionRef,
  }),
  /Staging não pode usar o projeto Supabase de produção/,
);

assert.throws(
  () => validateSupabaseEnvironmentBinding({
    appEnv: "staging",
    url: `https://${productionRef}.supabase.co`,
    key: "anon-test",
    expectedProjectRef: stagingRef,
    productionProjectRef: productionRef,
  }),
  /não corresponde ao EXPECTED_SUPABASE_PROJECT_REF/,
);

assert.throws(
  () => validateSupabaseEnvironmentBinding({
    appEnv: "staging",
    url: "",
    key: "anon-test",
    expectedProjectRef: stagingRef,
    productionProjectRef: productionRef,
  }),
  /VITE_SUPABASE_URL não configurada/,
);

const disabledFlags = loadIntegrationFlags({});
assert.equal(disabledFlags.email, false);
assert.equal(disabledFlags.billing, false);
assert.throws(() => assertIntegrationEnabled(disabledFlags, "email"), /EMAIL_SEND_ENABLED=false/);

const productionEnvironment = loadServerEnvironment(baseServerEnv);
assert.equal(productionEnvironment.appEnv, "production");
assert.equal(productionEnvironment.supabase.projectRef, productionRef);

const developmentEnvironment = loadServerEnvironment({
  ...baseServerEnv,
  APP_ENV: "development",
  VITE_APP_ENV: "development",
  PUBLIC_APP_URL: "https://dev.example.com",
});
assert.equal(developmentEnvironment.appEnv, "development");

const stagingEnvironment = loadServerEnvironment({
  ...baseServerEnv,
  APP_ENV: "staging",
  VITE_APP_ENV: "staging",
  VITE_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
  EXPECTED_SUPABASE_PROJECT_REF: stagingRef,
  PUBLIC_APP_URL: "https://staging.example.com",
});
assert.equal(stagingEnvironment.appEnv, "staging");
assert.throws(() => stagingEnvironment.assertEnabled("billing"), /BILLING_ENABLED=false/);

const encodedPayload = Buffer.from(JSON.stringify({ role: "service_role", ref: stagingRef })).toString("base64url");
assert.throws(
  () => loadServerEnvironment({
    ...baseServerEnv,
    SUPABASE_SERVICE_ROLE_KEY: `eyJhbGciOiJIUzI1NiJ9.${encodedPayload}.signature`,
  }),
  /SUPABASE_SERVICE_ROLE_KEY pertence a outro projeto Supabase/,
);

assert.throws(
  () => loadServerEnvironment({
    ...baseServerEnv,
    APP_ENV: "staging",
    VITE_APP_ENV: "staging",
    VITE_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
    EXPECTED_SUPABASE_PROJECT_REF: stagingRef,
    PUBLIC_APP_URL: "https://www.example.com",
  }),
  /Staging não pode usar a origem pública de produção/,
);

console.log("environment isolation tests: ok");
