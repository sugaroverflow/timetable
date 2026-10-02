import type { Register } from 'claude-code'
import { checkWrite, isPage } from './check'

// page-contract: Ed's questions page (claude/QUESTIONS-PAGE.md in edsaperia/dev-ops), kept by code.
//  1. Every write to the page is checked against the contract before it runs, and refused with the
//     reasons when it breaks it (2026-09-30 to 10-02: items with kind "decision" or "final", items
//     with no status, times in the future — each hid something from Ed).
//  2. A coordinator's lastActive is stamped at the end of every turn that did work.
//  3. Answers of the coordinator's project left without handledAt are named to it, at most hourly.
//  4. A coordinator other than dev-ops's is told when dev-ops main moves, so it re-reads the rules.
// The session counts as a coordinator once it writes coordinators/<project> on the page.

type Doc = Record<string, unknown>
type Write = { op: string; collection?: unknown; doc_id?: unknown; data?: unknown; file_path?: unknown }

const HANDLED_GRACE_MS = 10 * 60e3
const REMIND_EVERY_MS = 60 * 60e3
const RULES_REPO = 'https://github.com/edsaperia/dev-ops.git'

let project = ''        // learned from this session's own write to coordinators/<project>
let pageUrl = ''
let worked = false      // this turn made a tool call of its own
let inside = false      // the mod's own tool calls, which are neither work nor checked twice
let remindedAt = 0
let rulesSha = ''

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

// The documents an ArtifactData read printed, one JSON object per line between its BEGIN and END marks.
function docsOf(text: unknown): Array<{ id: string; data: Doc; version: number }> {
  if (typeof text !== 'string') return []
  const out: Array<{ id: string; data: Doc; version: number }> = []
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s.startsWith('{"id"')) continue
    try { out.push(JSON.parse(s)) } catch { /* not a document line */ }
  }
  return out
}

export const register: Register = on => {
  on('tool.call', { tool: 'ArtifactData' }, async ($, e, next) => {
    if (inside) return next(e)
    worked = true
    const a = e as unknown as { action: string; url?: string; collection?: string; doc_id?: string; data?: Doc; file_path?: string; writes?: Write[] }
    if (!isPage(a.url)) return next(e)
    const now = await $.clock.now()
    const writes: Write[] = a.action === 'batch' ? (a.writes ?? []) : [{ op: a.action, collection: a.collection, doc_id: a.doc_id, data: a.data, file_path: a.file_path }]
    const why: string[] = []
    for (const w of writes) {
      let data = w.data
      if (data === undefined && typeof w.file_path === 'string') {
        try { data = JSON.parse(await $.fs.read(w.file_path)) } catch { data = undefined }
      }
      why.push(...checkWrite(w.op, w.collection, w.doc_id, data, now))
      if (w.collection === 'coordinators' && (w.op === 'set' || w.op === 'update') && typeof w.doc_id === 'string') {
        project = w.doc_id
        pageUrl = a.url as string
      }
    }
    if (why.length) {
      return {
        deny: `page-contract: this write breaks the questions page's contract (claude/QUESTIONS-PAGE.md in edsaperia/dev-ops), so nothing was written:\n- ${why.join('\n- ')}\nFix the item and write it again.`,
      }
    }
    return next(e)
  })

  on('tool.call', ($, e, next) => {
    if (!inside) worked = true
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    worked = false
    if (project && project !== 'dev-ops') {
      try {
        const r = await $.process.run(['git', 'ls-remote', RULES_REPO, 'refs/heads/main'], { timeoutMs: 15000 })
        const sha = r.exitCode === 0 ? r.stdout.split(/\s/)[0] : ''
        if (sha && rulesSha && sha !== rulesSha) {
          await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: `page-contract: edsaperia/dev-ops main moved (${rulesSha.slice(0, 7)} → ${sha.slice(0, 7)}) since this session last looked. Before coordinator work, re-read CONVENTIONS.md and claude/QUESTIONS-PAGE.md from dev-ops main with the GitHub tool (not the container's checkout) and follow what they say now.` }] } })
        }
        if (sha) rulesSha = sha
      } catch { /* no network: say nothing */ }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!project || !pageUrl || !worked || (e as { agentId?: string }).agentId) return done
    inside = true
    try {
      const now = await $.clock.now()
      // 2. lastActive, pinned to the version just read.
      const got = await $.tool.call({ tool: 'ArtifactData', action: 'get', url: pageUrl, collection: 'coordinators', doc_id: project } as never)
      const me = docsOf((got as { text?: string }).text).find(d => d.id === project)
      if (me) {
        await $.tool.call({ tool: 'ArtifactData', action: 'update', url: pageUrl, collection: 'coordinators', doc_id: project, data: { lastActive: iso(now) }, if_version: me.version } as never)
      }
      // 3. Answers older than the grace period with no handledAt (or one older than the answer).
      if (now - remindedAt > REMIND_EVERY_MS) {
        const q = await $.tool.call({ tool: 'ArtifactData', action: 'query', url: pageUrl, collection: 'questions', query: { where: [['project', '==', project], ['status', '==', 'answered']], limit: 1000 } } as never)
        const late = docsOf((q as { text?: string }).text).filter(d => {
          const at = Date.parse(String((d.data.answer as Doc | undefined)?.at ?? ''))
          const handled = Date.parse(String(d.data.handledAt ?? ''))
          return at && now - at > HANDLED_GRACE_MS && (!handled || handled < at)
        })
        if (late.length) {
          remindedAt = now
          const ids = late.slice(0, 12).map(d => d.id).join(', ') + (late.length > 12 ? ` and ${late.length - 12} more` : '')
          await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: `page-contract: ${late.length} of ${project}'s answered items on Ed's page have no handledAt (answered over 10 minutes ago): ${ids}. Set handledAt (real clock, if_version pinned) on each you have acted on; act on any you have not.` }] } })
        }
      }
    } catch { /* bookkeeping never breaks a turn */ } finally {
      inside = false
    }
    return done
  })
}
