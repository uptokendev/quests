import { supabasePost } from './supabase'

export async function writeAdminAuditLog(entry: {
  adminUserId?: string | null
  action: string
  targetType?: string | null
  targetId?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}) {
  await supabasePost('/rest/v1/wm_admin_audit_log', {
    admin_user_id: entry.adminUserId || null,
    action: entry.action,
    target_type: entry.targetType || null,
    target_id: entry.targetId || null,
    before: entry.before || null,
    after: entry.after || null,
  })
}
