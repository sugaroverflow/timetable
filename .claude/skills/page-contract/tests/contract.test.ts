import type { On } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'

const PAGE = 'https://claude.ai/artifact/FoSoRQxMVh8cZocFpMP6KW'
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
const item = (over: Record<string, unknown> = {}) => ({
  project: 'draft', kind: 'update', title: 'PR #9: finished', context: 'Text.', asked: now(), askedBy: 'builder (PR #9)', status: 'open', ...over,
})

// The engine beneath the mod: every ArtifactData call that reaches it is answered "written".
function written(on: On) {
  mock.clock(on, { now: Date.now() })
  on('tool.call', { tool: 'ArtifactData' }, () => ({ result: { ok: true } } as never))
}
const call = ($: any, args: Record<string, unknown>) => $.tool.call({ tool: 'ArtifactData', url: PAGE, ...args })
const refused = (r: any) => r.isError === true || r.deny !== undefined
const reason = (r: any) => String(r.text ?? r.deny ?? '')

test('a well-formed item is written', async ($, on) => {
  written(on)
  const r = await call($, { action: 'set', collection: 'questions', doc_id: 'draft-u-1', data: item() })
  expect(refused(r)).toBe(false)
})

test('an item with no status is refused, saying why (draft PR #158 hid this way)', async ($, on) => {
  written(on)
  const { status: _status, ...noStatus } = item()
  const r = await call($, { action: 'set', collection: 'questions', doc_id: 'draft-t-1', data: noStatus })
  expect(refused(r)).toBe(true)
  expect(reason(r)).toContain('status is missing')
})

test('kind "decision" and kind "final" are refused', async ($, on) => {
  written(on)
  for (const kind of ['decision', 'final']) {
    const r = await call($, { action: 'set', collection: 'questions', doc_id: 'draft-x-' + kind, data: item({ kind }) })
    expect(refused(r)).toBe(true)
    expect(reason(r)).toContain('is not "question", "update" or "task"')
  }
})

test('options as bare strings, body and createdAt are refused, naming the right fields', async ($, on) => {
  written(on)
  const { context: _context, asked: _asked, ...rest } = item({ kind: 'question' })
  const r = await call($, { action: 'set', collection: 'questions', doc_id: 'draft-d-1', data: { ...rest, body: 'Text.', createdAt: now(), options: ['OK'] } })
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
  expect(refused(await call($, { action: 'update', collection: 'coordinators', doc_id: 'draft', data: { lastActive: ahead }, if_version: 1 }))).toBe(true)
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
  const seen: Array<Record<string, unknown>> = []
  on('tool.call', { tool: 'ArtifactData' }, (_$, e) => {
    const a = e as unknown as Record<string, unknown>
    seen.push(a)
    if (a.action === 'get') return { result: { ok: true }, text: '=== BEGIN\n{"id":"draft","data":{"lastActive":"2026-10-02T10:00:00Z"},"version":7}\n=== END' } as never
    if (a.action === 'query') return { result: { ok: true }, text: '' } as never
    return { result: { ok: true } } as never
  })
  on('turn.complete', (_$, e) => ({ text: (e as { answer: string }).answer }))
  // The session writes coordinators/draft, which is how the mod learns it coordinates draft.
  await call($, { action: 'update', collection: 'coordinators', doc_id: 'draft', data: { lastActive: '2026-10-02T13:59:00Z' }, if_version: 6 })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  const stamp = seen.find(a => a.action === 'update' && (a.data as Record<string, unknown>)?.lastActive === '2026-10-02T14:00:00Z')
  expect(stamp?.if_version).toBe(7)
})
