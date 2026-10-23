import type { On } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'

// A made-up page: the mod guards whichever page QUESTIONS_PAGE_IDS names (link id, artifact uuid).
const LINK_ID = 'TestPageLink0000000000'
const UUID = '00000000-0000-4000-8000-00000000c0de'
const PAGE = 'https://claude.ai/artifact/' + LINK_ID
const IDS = { QUESTIONS_PAGE_IDS: `${LINK_ID},${UUID}` }
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
const item = (over: Record<string, unknown> = {}) => ({
  project: 'alpha', kind: 'update', title: 'PR #9: finished', context: 'Text.', asked: now(), askedBy: 'builder (PR #9)', status: 'open', ...over,
})

// The engine beneath the mod: every ArtifactData call that reaches it is answered "written".
function written(on: On) {
  mock.clock(on, { now: Date.now() })
  mock.env(on, IDS)
  on('tool.call', { tool: 'ArtifactData' }, () => ({ result: { ok: true } } as never))
}
const call = ($: any, args: Record<string, unknown>) => $.tool.call({ tool: 'ArtifactData', url: PAGE, ...args })
const refused = (r: any) => r.isError === true || r.deny !== undefined
const reason = (r: any) => String(r.text ?? r.deny ?? '')

test('a well-formed item is written', async ($, on) => {
  written(on)
  const r = await call($, { action: 'set', collection: 'questions', doc_id: 'alpha-u-1', data: item() })
  expect(refused(r)).toBe(false)
})

test('an item with no status is refused, saying why (an item once hid this way)', async ($, on) => {
  written(on)
  const { status: _status, ...noStatus } = item()
  const r = await call($, { action: 'set', collection: 'questions', doc_id: 'alpha-t-1', data: noStatus })
  expect(refused(r)).toBe(true)
  expect(reason(r)).toContain('status is missing')
})

test('kind "decision" and kind "final" are refused', async ($, on) => {
  written(on)
  for (const kind of ['decision', 'final']) {
    const r = await call($, { action: 'set', collection: 'questions', doc_id: 'alpha-x-' + kind, data: item({ kind }) })
    expect(refused(r)).toBe(true)
    expect(reason(r)).toContain('is not "question", "update" or "task"')
  }
})

test('options as bare strings, body and createdAt are refused, naming the right fields', async ($, on) => {
  written(on)
  const { context: _context, asked: _asked, ...rest } = item({ kind: 'question' })
  const r = await call($, { action: 'set', collection: 'questions', doc_id: 'alpha-d-1', data: { ...rest, body: 'Text.', createdAt: now(), options: ['OK'] } })
  expect(refused(r)).toBe(true)
  expect(reason(r)).toContain('"context", not "body"')
  expect(reason(r)).toContain('"asked", not "createdAt"')
  expect(reason(r)).toContain('options[0] must be {key, label, description}')
})

test('a question with no options is refused; an update with none is fine', async ($, on) => {
  written(on)
  expect(refused(await call($, { action: 'set', collection: 'questions', doc_id: 'q1', data: item({ kind: 'question' }) }))).toBe(true)
  expect(refused(await call($, { action: 'set', collection: 'questions', doc_id: 'u1', data: item({ kind: 'update' }) }))).toBe(false)
})

test('a time in the future is refused; a few seconds of skew is not', async ($, on) => {
  written(on)
  const ahead = new Date(Date.now() + 10 * 60e3).toISOString()
  const r = await call($, { action: 'set', collection: 'questions', doc_id: 'f1', data: item({ asked: ahead }) })
  expect(refused(r)).toBe(true)
  expect(reason(r)).toContain('is in the future')
  const skew = new Date(Date.now() + 20e3).toISOString()
  expect(refused(await call($, { action: 'update', collection: 'questions', doc_id: 'f1', data: { handledAt: skew }, if_version: 1 }))).toBe(false)
  expect(refused(await call($, { action: 'update', collection: 'coordinators', doc_id: 'alpha', data: { lastActive: ahead }, if_version: 1 }))).toBe(true)
})

test('a batch is refused whole when one entry breaks the contract', async ($, on) => {
  written(on)
  const r = await call($, { action: 'batch', writes: [
    { op: 'set', collection: 'questions', doc_id: 'ok1', data: item() },
    { op: 'set', collection: 'questions', doc_id: 'bad1', data: item({ status: 'pending' }) },
  ] })
  expect(refused(r)).toBe(true)
  expect(reason(r)).toContain('questions/bad1')
})

test('an update that only stamps handledAt passes; reads and other artifacts are never checked', async ($, on) => {
  written(on)
  expect(refused(await call($, { action: 'update', collection: 'questions', doc_id: 'u1', data: { handledAt: now() }, if_version: 2 }))).toBe(false)
  expect(refused(await call($, { action: 'get', collection: 'questions', doc_id: 'u1' }))).toBe(false)
  expect(refused(await $.tool.call({ tool: 'ArtifactData', url: 'https://claude.ai/artifact/SomeOtherPage', action: 'set', collection: 'questions', doc_id: 'z', data: { kind: 'decision' } } as never))).toBe(false)
})

test('a bad links url is refused', async ($, on) => {
  written(on)
  const r = await call($, { action: 'set', collection: 'questions', doc_id: 'l1', data: item({ links: ['https://github.com/x'] }) })
  expect(refused(r)).toBe(true)
})

test('at the end of a turn that did work, the coordinator\'s lastActive is stamped, pinned to the version read', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-02T14:00:00Z') })
  mock.env(on, IDS)
  const seen: Array<Record<string, unknown>> = []
  on('tool.call', { tool: 'ArtifactData' }, (_$, e) => {
    const a = e as unknown as Record<string, unknown>
    seen.push(a)
    if (a.action === 'get') return { result: { ok: true }, text: '=== BEGIN\n{"id":"alpha","data":{"lastActive":"2026-10-02T10:00:00Z"},"version":7}\n=== END' } as never
    if (a.action === 'query') return { result: { ok: true }, text: '' } as never
    return { result: { ok: true } } as never
  })
  on('turn.complete', (_$, e) => ({ text: (e as { answer: string }).answer }))
  // The session writes coordinators/alpha, which is how the mod learns it coordinates alpha.
  await call($, { action: 'update', collection: 'coordinators', doc_id: 'alpha', data: { lastActive: '2026-10-02T13:59:00Z' }, if_version: 6 })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  const stamp = seen.find(a => a.action === 'update' && (a.data as Record<string, unknown>)?.lastActive === '2026-10-02T14:00:00Z')
  expect(stamp?.if_version).toBe(7)
})

test('after a restart, a coordinator is found by its own session link and its lastActive is stamped', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-03T01:30:00Z') })
  mock.env(on, { ...IDS, CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01BetaCoordinator0000000' })
  const seen: Array<Record<string, unknown>> = []
  on('tool.call', { tool: 'ArtifactData' }, (_$, e) => {
    const a = e as unknown as Record<string, unknown>
    seen.push(a)
    if (a.action === 'list') return { result: { ok: true }, text: '=== BEGIN\n{"id":"alpha","data":{"sessionUrl":"https://claude.ai/code/session_01AlphaCoordinator000000"},"version":3}\n{"id":"beta","data":{"sessionUrl":"https://claude.ai/code/session_01BetaCoordinator0000000"},"version":4}\n=== END' } as never
    if (a.action === 'get') return { result: { ok: true }, text: '=== BEGIN\n{"id":"beta","data":{"lastActive":"2026-10-02T20:10:40Z"},"version":49}\n=== END' } as never
    return { result: { ok: true }, text: '' } as never
  })
  on('turn.complete', (_$, e) => ({ text: (e as { answer: string }).answer }))
  // A turn that only reads the page: no write to coordinators/<project> to learn from.
  await call($, { action: 'query', collection: 'questions', query: { where: [['project', '==', 'beta']] } })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  const stamp = seen.find(a => a.action === 'update' && a.doc_id === 'beta' && (a.data as Record<string, unknown>)?.lastActive === '2026-10-03T01:30:00Z')
  expect(stamp?.if_version).toBe(49)
})

test('a session whose link is not on the page is never stamped', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-03T01:30:00Z') })
  mock.env(on, { ...IDS, CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01Builder000000000000000' })
  const seen: Array<Record<string, unknown>> = []
  on('tool.call', { tool: 'ArtifactData' }, (_$, e) => {
    const a = e as unknown as Record<string, unknown>
    seen.push(a)
    if (a.action === 'list') return { result: { ok: true }, text: '=== BEGIN\n{"id":"beta","data":{"sessionUrl":"https://claude.ai/code/session_01BetaCoordinator0000000"},"version":4}\n=== END' } as never
    return { result: { ok: true }, text: '' } as never
  })
  on('turn.complete', (_$, e) => ({ text: (e as { answer: string }).answer }))
  await call($, { action: 'get', collection: 'questions', doc_id: 'beta-q-1' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(seen.some(a => a.action === 'update')).toBe(false)
})

test('after a restart, a turn that never touched the page still finds the coordinator and stamps it (2026-10-04 to 10-21)', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T16:00:00Z') })
  mock.env(on, { ...IDS, CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01GammaCoordinator000000' })
  const seen: Array<Record<string, unknown>> = []
  on('tool.call', { tool: 'ArtifactData' }, (_$, e) => {
    const a = e as unknown as Record<string, unknown>
    seen.push(a)
    if (a.action === 'list') return { result: { ok: true }, text: '=== BEGIN\n{"id":"gamma","data":{"sessionUrl":"https://claude.ai/code/session_01GammaCoordinator000000"},"version":5}\n=== END' } as never
    if (a.action === 'get') return { result: { ok: true }, text: '=== BEGIN\n{"id":"gamma","data":{"lastActive":"2026-10-21T09:00:00Z"},"version":80}\n=== END' } as never
    return { result: { ok: true }, text: '' } as never
  })
  on('tool.call', { tool: 'ReadNotifications' }, () => ({ result: {}, text: '0 notifications remain queued.' } as never))
  on('turn.complete', (_$, e) => ({ text: (e as { answer: string }).answer }))
  await $.tool.call({ tool: 'ReadNotifications' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  const stamp = seen.find(a => a.action === 'update' && a.doc_id === 'gamma' && (a.data as Record<string, unknown>)?.lastActive === '2026-10-22T16:00:00Z')
  expect(stamp?.if_version).toBe(80)
})

test('a page-comment wake is told whose wake thread it came on (2026-10-05)', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T16:00:00Z') })
  mock.env(on, IDS)
  on('tool.call', { tool: 'ArtifactData' }, (_$, e) => {
    const a = e as unknown as Record<string, unknown>
    if (a.action === 'list' && a.collection === 'wake') return { result: { ok: true }, text: '=== BEGIN\n{"id":"alpha","data":{"threadId":"863e3254-546c-4998-ad9d-0fb15d5198ea"},"version":3}\n{"id":"beta","data":{"threadId":"ab7a8cdb-633f-4e87-a0e2-50e889e5f8d1"},"version":1}\n=== END' } as never
    return { result: { ok: true }, text: '' } as never
  })
  const wake = (thread: string) => `<webhook-payload>\n    {"slug":"${UUID}","event":"comment","version":"1","thread":"${thread}","emitted_at":"2026-10-22T15:59:00Z"}\n</webhook-payload>`
  let text = wake('ab7a8cdb-633f-4e87-a0e2-50e889e5f8d1')
  on('tool.call', { tool: 'ReadNotifications' }, () => ({ result: {}, text } as never))
  // The session coordinates alpha: it says so by writing coordinators/alpha.
  await call($, { action: 'update', collection: 'coordinators', doc_id: 'alpha', data: { lastActive: now() }, if_version: 6 })
  const other = await $.tool.call({ tool: 'ReadNotifications' } as never) as { context?: string[] }
  expect(String(other.context)).toContain("ab7a8cdb-633f-4e87-a0e2-50e889e5f8d1 is beta's wake thread: not alpha's")
  text = wake('863e3254-546c-4998-ad9d-0fb15d5198ea')
  const mine = await $.tool.call({ tool: 'ReadNotifications' } as never) as { context?: string[] }
  expect(String(mine.context)).toContain("is alpha's wake thread: yours, read it")
  // A thread started a moment ago is not in the collection yet: never called nobody's (2026-10-22 16:54).
  text = wake('e5162121-72b5-46ea-b640-1659724ff076')
  const fresh = await $.tool.call({ tool: 'ReadNotifications' } as never) as { context?: string[] }
  expect(String(fresh.context)).toContain('re-read wake/alpha before treating it as not yours')
  text = 'Input for dev-ops from another project: nothing about the page here.'
  const plain = await $.tool.call({ tool: 'ReadNotifications' } as never) as { context?: string[] }
  expect(plain.context?.length ?? 0).toBe(0)
})

test('with QUESTIONS_PAGE_IDS unset the mod does nothing: a bad write to the page passes unchecked and nothing is stamped', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-23T12:00:00Z') })
  mock.env(on, { CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01AlphaCoordinator000000' })
  const seen: Array<Record<string, unknown>> = []
  on('tool.call', { tool: 'ArtifactData' }, (_$, e) => {
    const a = e as unknown as Record<string, unknown>
    seen.push(a)
    if (a.action === 'list') return { result: { ok: true }, text: '=== BEGIN\n{"id":"alpha","data":{"sessionUrl":"https://claude.ai/code/session_01AlphaCoordinator000000"},"version":3}\n=== END' } as never
    if (a.action === 'get') return { result: { ok: true }, text: '=== BEGIN\n{"id":"alpha","data":{"lastActive":"2026-10-23T10:00:00Z"},"version":7}\n=== END' } as never
    return { result: { ok: true }, text: '' } as never
  })
  on('turn.complete', (_$, e) => ({ text: (e as { answer: string }).answer }))
  const { status: _status, ...noStatus } = item({ kind: 'decision' })
  const r = await call($, { action: 'set', collection: 'questions', doc_id: 'alpha-x-1', data: noStatus })
  expect(refused(r)).toBe(false)
  await call($, { action: 'update', collection: 'coordinators', doc_id: 'alpha', data: { lastActive: '2026-10-23T11:59:00Z' }, if_version: 6 })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  // Only the session's own two writes reached the engine: no stamp, no lookup, no query.
  expect(seen.length).toBe(2)
  expect(seen.some(a => a.action === 'update' && (a.data as Record<string, unknown>)?.lastActive === '2026-10-23T12:00:00Z')).toBe(false)
})
