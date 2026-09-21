import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminSource = readFileSync('src/pages/AdminPanel.tsx', 'utf8');
const managerSource = readFileSync('src/components/admin/ManualPushScheduleManager.tsx', 'utf8');
const serverSource = readFileSync('server.ts', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20260921150000_create_manual_push_schedules.sql', 'utf8');
const appVersionSource = readFileSync('src/components/layout/AppVersion.tsx', 'utf8');

assert.match(adminSource, /\/api\/admin\/notifications\/schedules/);
assert.match(adminSource, /type="datetime-local"/);
assert.match(adminSource, /Programar Notificação/);
assert.match(adminSource, /recipientIds: targets/);
assert.match(adminSource, /<ManualPushScheduleManager/);
assert.match(managerSource, /Cancelar/);
assert.match(managerSource, /statusLabels/);
assert.match(managerSource, /push_accepted_count/);
assert.match(managerSource, /filter\(\(schedule\) => schedule\.status !== 'completed'\)/);
assert.match(managerSource, /onCompleted\?\.\(\)/);
assert.match(adminSource, /notification\.source === 'manual-push'/);
assert.match(adminSource, /onCompleted=\{\(\) => void refreshPushNotificationLogs\(\)\}/);
assert.match(serverSource, /app.post\("\/api\/admin\/notifications\/schedules"/);
assert.match(serverSource, /app.delete\("\/api\/admin\/notifications\/schedules\/:id"/);
assert.match(serverSource, /processDueManualPushSchedules/);
assert.match(serverSource, /.eq\("status", "pending"\)/);
assert.match(serverSource, /status: "processing"/);
assert.match(serverSource, /sendNotificationInternal\(/);
assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS public\.manual_push_schedules/);
assert.match(migrationSource, /recipient_ids JSONB NOT NULL/);
assert.match(migrationSource, /ALTER TABLE public\.manual_push_schedules ENABLE ROW LEVEL SECURITY/);
assert.match(migrationSource, /USING \(is_admin\(\)\)/);
assert.match(appVersionSource, /APP_VERSION = "v1\.10\.922"/);

console.log('Manual push scheduling tests passed.');
