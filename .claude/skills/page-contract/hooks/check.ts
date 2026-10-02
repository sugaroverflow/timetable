// The questions page's data contract (claude/QUESTIONS-PAGE.md in edsaperia/dev-ops), as code.
// Pure functions: given a write and the time, the reasons it breaks the contract ([] when it holds).

// The page: its claude.ai link and its artifact id. Writes to any other artifact are not checked.
export const PAGE_IDS = ['FoSoRQxMVh8cZocFpMP6KW', '77dc0e00-9f35-45ee-af49-0632428ebbf5']
export const isPage = (url: unknown) => typeof url === 'string' && PAGE_IDS.some(id => url.includes(id))

// A time may run ahead of this host's clock by this much (clock skew), never more.
const SKEW_MS = 2 * 60e3

type Doc = Record<string, unknown>
const isObj = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isHttps = (v: unknown) => isStr(v) && /^https:\/\//.test(v)

function time(field: string, v: unknown, now: number, why: string[]) {
  if (v === undefined) return
  const t = isStr(v) ? Date.parse(v) : NaN
  if (Number.isNaN(t)) why.push(`${field} is not an ISO time (write it with the real clock, e.g. \`date -u +%FT%TZ\`)`)
  else if (t > now + SKEW_MS) why.push(`${field} ${v} is in the future (now is ${new Date(now).toISOString()}); write the real clock, never a rounded-up time`)
}

function links(field: string, v: unknown, why: string[], needText: boolean) {
  if (v === undefined) return
  if (!Array.isArray(v)) { why.push(`${field} must be an array`); return }
  v.forEach((l, i) => {
    if (!isObj(l) || !isStr(l.label)) why.push(`${field}[${i}] must be an object with a string label`)
    else if (needText ? !isStr(l.text) : !isHttps(l.url)) why.push(needText ? `${field}[${i}] needs a string text` : `${field}[${i}].url must start with https://`)
    else if (needText && l.url !== undefined && !isHttps(l.url)) why.push(`${field}[${i}].url must start with https://`)
  })
}

// One item of the questions collection: `whole` for a set (every coordinator field must be there),
// otherwise an update, where only the fields present are checked.
export function checkQuestion(d: Doc, now: number, whole: boolean): string[] {
  const why: string[] = []
  const kind = d.kind
  if (kind !== undefined && kind !== 'question' && kind !== 'update' && kind !== 'task')
    why.push(`kind ${JSON.stringify(kind)} is not "question", "update" or "task" (a decision taken on Ed's behalf is an "update"; a builder's FINAL is an "update")`)
  if (d.status !== undefined && !['open', 'answered', 'withdrawn'].includes(d.status as string))
    why.push(`status ${JSON.stringify(d.status)} is not "open", "answered" or "withdrawn"`)
  if (whole) {
    if (d.status === undefined) why.push('status is missing: a new item is written with "status": "open", or Ed never sees it')
    if (!isStr(d.title) || !d.title) why.push('title is missing (a string: the item in one line)')
    if (!isStr(d.context)) why.push(isStr(d.body) ? 'the text goes in "context", not "body"' : 'context is missing (a string: what Ed needs to answer from his phone)')
    if (!isStr(d.project) || !d.project) why.push('project is missing')
    if (!isStr(d.askedBy)) why.push('askedBy is missing (e.g. "draft coordinator (cloud)", "builder (PR #12)")')
    if (d.asked === undefined) why.push(`asked is missing${d.createdAt !== undefined ? ' ("asked", not "createdAt")' : ''}: write the real clock, now ${new Date(now).toISOString()}`)
  } else {
    if (d.title !== undefined && (!isStr(d.title) || !d.title)) why.push('title must be a non-empty string')
    if (d.context !== undefined && !isStr(d.context)) why.push('context must be a string')
  }
  time('asked', d.asked, now, why)
  time('handledAt', d.handledAt, now, why)
  const effKind = kind ?? (whole ? 'question' : undefined)
  if (d.options !== undefined || (whole && effKind === 'question')) {
    const o = d.options
    if (!Array.isArray(o)) why.push('options must be an array of {key, label, description}')
    else {
      if (effKind === 'question' && o.length === 0) why.push('a question needs options (an OK-only item is kind "update"; a Done-only item is kind "task")')
      o.forEach((x, i) => {
        if (!isObj(x) || !isStr(x.key) || !x.key || !isStr(x.label)) why.push(`options[${i}] must be {key, label, description}, not ${JSON.stringify(x)}`)
      })
    }
  }
  links('links', d.links, why, false)
  links('copy', d.copy, why, true)
  return why
}

// One in-flight item: a set needs what the page draws; times are real.
export function checkFlight(d: Doc, now: number, whole: boolean): string[] {
  const why: string[] = []
  if (whole) {
    if (!isStr(d.project) || !d.project) why.push('project is missing')
    if (!isStr(d.title) || !d.title) why.push('title is missing')
  }
  if (d.status !== undefined && d.status !== 'active' && d.status !== 'done') why.push(`status ${JSON.stringify(d.status)} is not "active" or "done"`)
  for (const f of ['startedAt', 'updatedAt']) time(f, d[f], now, why)
  if (d.expectBy !== undefined && d.expectBy !== null && Number.isNaN(Date.parse(String(d.expectBy)))) why.push('expectBy is not an ISO time')
  links('links', d.links, why, false)
  return why
}

export function checkCoordinator(d: Doc, now: number): string[] {
  const why: string[] = []
  time('lastActive', d.lastActive, now, why)
  if (d.sessionUrl !== undefined && !isHttps(d.sessionUrl)) why.push('sessionUrl must start with https://')
  return why
}

// One write as the ArtifactData tool takes it (a set or update; a batch is checked entry by entry).
export function checkWrite(op: string, collection: unknown, docId: unknown, data: unknown, now: number): string[] {
  if (op !== 'set' && op !== 'update') return []
  if (!isObj(data)) return []
  const whole = op === 'set'
  const where = `${collection}/${docId}`
  const why = collection === 'questions' ? checkQuestion(data, now, whole)
    : collection === 'inflight' ? checkFlight(data, now, whole)
    : collection === 'coordinators' ? checkCoordinator(data, now)
    : []
  return why.map(w => `${where}: ${w}`)
}
