/**
 * Minimal in-memory stand-in for the MongoDB driver.
 *
 * Covers the subset of the Collection / Db API this project uses so the app can run with
 * no database process at all (dev, tests, demos). Plain Maps and arrays only: there is no
 * background work, so CPU cost is zero while idle.
 *
 * Optional durability: set MEMORY_DB_FILE to a path and the store is snapshotted there
 * (debounced) and reloaded on start, so a dev restart keeps users and match history.
 */
import { ObjectId } from 'mongodb'
import { promises as fs } from 'fs'
import { dirname } from 'path'

type Doc = Record<string, any>

// ---------- value helpers ----------

function isPlainObject(value: unknown): value is Doc {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T
  if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as unknown as T
  if (Array.isArray(value)) return value.map(clone) as unknown as T
  if (isPlainObject(value)) {
    const out: Doc = {}
    for (const key of Object.keys(value)) out[key] = clone((value as Doc)[key])
    return out as T
  }
  return value
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.getTime()
  if (value instanceof ObjectId) return value.toHexString()
  return value
}

function valuesEqual(a: unknown, b: unknown): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  if (na === null || nb === null || na === undefined || nb === undefined) return false
  if (typeof na !== 'object' || typeof nb !== 'object') return false
  if (Array.isArray(na) !== Array.isArray(nb)) return false
  if (Array.isArray(na)) {
    const arrB = nb as unknown[]
    return na.length === arrB.length && na.every((v, i) => valuesEqual(v, arrB[i]))
  }
  const ka = Object.keys(na as Doc)
  const kb = Object.keys(nb as Doc)
  if (ka.length !== kb.length) return false
  return ka.every(k => valuesEqual((na as Doc)[k], (nb as Doc)[k]))
}

function compareValues(a: unknown, b: unknown): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 0
  if (na === undefined || na === null) return -1
  if (nb === undefined || nb === null) return 1
  if (typeof na === 'number' && typeof nb === 'number') return na - nb
  if (typeof na === 'string' && typeof nb === 'string') return na < nb ? -1 : na > nb ? 1 : 0
  if (typeof na === 'boolean' && typeof nb === 'boolean') return Number(na) - Number(nb)
  return String(na) < String(nb) ? -1 : 1
}

/** Resolve a dot path, expanding through arrays (Mongo semantics). */
function getPathValues(doc: unknown, path: string): unknown[] {
  const parts = path.split('.')
  let current: unknown[] = [doc]
  for (const part of parts) {
    const next: unknown[] = []
    for (const value of current) {
      if (value === null || value === undefined) continue
      if (Array.isArray(value)) {
        const index = Number(part)
        if (Number.isInteger(index) && String(index) === part) {
          next.push(value[index])
        } else {
          for (const item of value) {
            if (item && typeof item === 'object') next.push((item as Doc)[part])
          }
        }
      } else if (typeof value === 'object') {
        next.push((value as Doc)[part])
      }
    }
    current = next
  }
  return current
}

function getPath(doc: Doc, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = doc
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Doc)[part]
  }
  return current
}

function setPath(doc: Doc, path: string, value: unknown): void {
  const parts = path.split('.')
  let current: Doc = doc
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (!isPlainObject(current[part]) && !Array.isArray(current[part])) current[part] = {}
    current = current[part]
  }
  current[parts[parts.length - 1]!] = value
}

function unsetPath(doc: Doc, path: string): void {
  const parts = path.split('.')
  let current: unknown = doc
  for (let i = 0; i < parts.length - 1; i++) {
    if (current === null || typeof current !== 'object') return
    current = (current as Doc)[parts[i]!]
  }
  if (current && typeof current === 'object') delete (current as Doc)[parts[parts.length - 1]!]
}

// ---------- query matching ----------

function matchesCondition(fieldValues: unknown[], condition: unknown): boolean {
  const exists = fieldValues.some(v => v !== undefined)

  if (isPlainObject(condition) && Object.keys(condition).some(k => k.startsWith('$'))) {
    return Object.entries(condition).every(([op, operand]) => {
      switch (op) {
        case '$eq':
          return fieldValues.some(v => matchesEquality(v, operand))
        case '$ne':
          return !fieldValues.some(v => matchesEquality(v, operand))
        case '$gt':
          return fieldValues.some(v => v !== undefined && v !== null && compareValues(v, operand) > 0)
        case '$gte':
          return fieldValues.some(v => v !== undefined && v !== null && compareValues(v, operand) >= 0)
        case '$lt':
          return fieldValues.some(v => v !== undefined && v !== null && compareValues(v, operand) < 0)
        case '$lte':
          return fieldValues.some(v => v !== undefined && v !== null && compareValues(v, operand) <= 0)
        case '$in':
          return (operand as unknown[]).some(candidate => fieldValues.some(v => matchesEquality(v, candidate)))
        case '$nin':
          return !(operand as unknown[]).some(candidate => fieldValues.some(v => matchesEquality(v, candidate)))
        case '$exists':
          return operand ? exists : !exists
        case '$regex': {
          const regex = operand instanceof RegExp ? operand : new RegExp(String(operand), (condition as Doc).$options)
          return fieldValues.some(v => typeof v === 'string' && regex.test(v))
        }
        case '$options':
          return true
        case '$not':
          return !matchesCondition(fieldValues, operand)
        case '$size':
          return fieldValues.some(v => Array.isArray(v) && v.length === operand)
        case '$elemMatch':
          return fieldValues.some(v => Array.isArray(v) && v.some(item => matchesFilter(item as Doc, operand as Doc)))
        default:
          throw new Error(`memoryDb: unsupported query operator ${op}`)
      }
    })
  }

  return fieldValues.some(v => matchesEquality(v, condition))
}

function matchesEquality(value: unknown, expected: unknown): boolean {
  if (expected === null) return value === null || value === undefined
  if (Array.isArray(value) && !Array.isArray(expected)) {
    return value.some(item => valuesEqual(item, expected))
  }
  return valuesEqual(value, expected)
}

export function matchesFilter(doc: Doc, filter: Doc | undefined): boolean {
  if (!filter) return true
  return Object.entries(filter).every(([key, condition]) => {
    switch (key) {
      case '$and':
        return (condition as Doc[]).every(sub => matchesFilter(doc, sub))
      case '$or':
        return (condition as Doc[]).some(sub => matchesFilter(doc, sub))
      case '$nor':
        return !(condition as Doc[]).some(sub => matchesFilter(doc, sub))
      case '$expr':
        throw new Error('memoryDb: $expr is not supported')
      default:
        return matchesCondition(getPathValues(doc, key), condition)
    }
  })
}

// ---------- updates ----------

function applyUpdate(doc: Doc, update: Doc, isInsert: boolean): boolean {
  const operatorKeys = Object.keys(update).filter(k => k.startsWith('$'))
  if (operatorKeys.length === 0) {
    // Replacement document
    const id = doc._id
    for (const key of Object.keys(doc)) delete doc[key]
    Object.assign(doc, clone(update))
    if (id !== undefined) doc._id = id
    return true
  }

  let changed = false
  for (const [op, spec] of Object.entries(update)) {
    switch (op) {
      case '$set':
        for (const [path, value] of Object.entries(spec as Doc)) {
          if (!valuesEqual(getPath(doc, path), value)) {
            setPath(doc, path, clone(value))
            changed = true
          }
        }
        break
      case '$setOnInsert':
        if (isInsert) {
          for (const [path, value] of Object.entries(spec as Doc)) {
            setPath(doc, path, clone(value))
            changed = true
          }
        }
        break
      case '$unset':
        for (const path of Object.keys(spec as Doc)) {
          if (getPath(doc, path) !== undefined) {
            unsetPath(doc, path)
            changed = true
          }
        }
        break
      case '$inc':
        for (const [path, amount] of Object.entries(spec as Doc)) {
          const current = Number(getPath(doc, path) ?? 0)
          setPath(doc, path, current + Number(amount))
          changed = true
        }
        break
      case '$push':
        for (const [path, value] of Object.entries(spec as Doc)) {
          const existing = getPath(doc, path)
          const arr = Array.isArray(existing) ? existing : []
          if (isPlainObject(value) && '$each' in value) {
            arr.push(...clone((value as Doc).$each as unknown[]))
          } else {
            arr.push(clone(value))
          }
          setPath(doc, path, arr)
          changed = true
        }
        break
      case '$addToSet':
        for (const [path, value] of Object.entries(spec as Doc)) {
          const existing = getPath(doc, path)
          const arr = Array.isArray(existing) ? existing : []
          const candidates = isPlainObject(value) && '$each' in value ? ((value as Doc).$each as unknown[]) : [value]
          for (const candidate of candidates) {
            if (!arr.some(item => valuesEqual(item, candidate))) {
              arr.push(clone(candidate))
              changed = true
            }
          }
          setPath(doc, path, arr)
        }
        break
      case '$pull':
        for (const [path, condition] of Object.entries(spec as Doc)) {
          const existing = getPath(doc, path)
          if (!Array.isArray(existing)) continue
          const kept = existing.filter(item => {
            if (isPlainObject(condition) && Object.keys(condition).some(k => k.startsWith('$'))) {
              return !matchesCondition([item], condition)
            }
            if (isPlainObject(condition) && isPlainObject(item)) {
              return !matchesFilter(item, condition)
            }
            return !valuesEqual(item, condition)
          })
          if (kept.length !== existing.length) changed = true
          setPath(doc, path, kept)
        }
        break
      case '$currentDate':
        for (const path of Object.keys(spec as Doc)) {
          setPath(doc, path, new Date())
          changed = true
        }
        break
      default:
        throw new Error(`memoryDb: unsupported update operator ${op}`)
    }
  }
  return changed
}

function buildUpsertDoc(filter: Doc): Doc {
  const doc: Doc = {}
  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith('$')) continue
    if (isPlainObject(value) && Object.keys(value).some(k => k.startsWith('$'))) {
      if ('$eq' in value) setPath(doc, key, clone(value.$eq))
      continue
    }
    setPath(doc, key, clone(value))
  }
  return doc
}

// ---------- cursor ----------

export class MemoryCursor<T extends Doc = Doc> {
  private sortSpec: Doc | null = null
  private limitCount: number | null = null
  private skipCount = 0
  private projection: Doc | null = null

  constructor(private readonly source: () => T[]) {}

  sort(spec: Doc): this {
    this.sortSpec = spec
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  skip(count: number): this {
    this.skipCount = count
    return this
  }

  project(spec: Doc): this {
    this.projection = spec
    return this
  }

  private materialize(): T[] {
    let docs = this.source()
    if (this.sortSpec) {
      const entries = Object.entries(this.sortSpec)
      docs = [...docs].sort((a, b) => {
        for (const [key, dir] of entries) {
          const cmp = compareValues(getPath(a, key), getPath(b, key))
          if (cmp !== 0) return dir < 0 ? -cmp : cmp
        }
        return 0
      })
    }
    if (this.skipCount) docs = docs.slice(this.skipCount)
    if (this.limitCount !== null && this.limitCount > 0) docs = docs.slice(0, this.limitCount)
    if (this.projection) {
      const include = Object.entries(this.projection).filter(([, v]) => v).map(([k]) => k)
      const exclude = Object.entries(this.projection).filter(([, v]) => !v).map(([k]) => k)
      docs = docs.map(doc => {
        if (include.length) {
          const out: Doc = {}
          if (!exclude.includes('_id') && doc._id !== undefined) out._id = doc._id
          for (const key of include) {
            const value = getPath(doc, key)
            if (value !== undefined) setPath(out, key, value)
          }
          return out as T
        }
        const out = clone(doc)
        for (const key of exclude) unsetPath(out, key)
        return out
      })
    }
    return docs.map(clone)
  }

  async toArray(): Promise<T[]> {
    return this.materialize()
  }

  async count(): Promise<number> {
    return this.materialize().length
  }

  async next(): Promise<T | null> {
    return this.materialize()[0] ?? null
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (const doc of this.materialize()) yield doc
  }
}

// ---------- collection ----------

export class MemoryCollection<T extends Doc = Doc> {
  private docs: Doc[] = []

  constructor(public readonly collectionName: string, private readonly onChange: () => void) {}

  /** @internal snapshot helpers */
  _load(docs: Doc[]) {
    this.docs = docs
  }

  _dump(): Doc[] {
    return this.docs
  }

  private filtered(filter?: Doc): Doc[] {
    return this.docs.filter(doc => matchesFilter(doc, filter))
  }

  find(filter: Doc = {}, options: Doc = {}): MemoryCursor<T> {
    const cursor = new MemoryCursor<T>(() => this.filtered(filter) as T[])
    if (options.sort) cursor.sort(options.sort)
    if (options.limit) cursor.limit(options.limit)
    if (options.skip) cursor.skip(options.skip)
    if (options.projection) cursor.project(options.projection)
    return cursor
  }

  async findOne(filter: Doc = {}, options: Doc = {}): Promise<T | null> {
    const docs = await this.find(filter, { ...options, limit: 1 }).toArray()
    return docs[0] ?? null
  }

  async insertOne(doc: T): Promise<{ acknowledged: true; insertedId: any }> {
    const stored = clone(doc) as Doc
    if (stored._id === undefined) stored._id = new ObjectId()
    this.docs.push(stored)
    ;(doc as Doc)._id = stored._id
    this.onChange()
    return { acknowledged: true, insertedId: stored._id }
  }

  async insertMany(docs: T[]): Promise<{ acknowledged: true; insertedCount: number; insertedIds: Record<number, any> }> {
    const insertedIds: Record<number, any> = {}
    for (let i = 0; i < docs.length; i++) {
      const result = await this.insertOne(docs[i]!)
      insertedIds[i] = result.insertedId
    }
    return { acknowledged: true, insertedCount: docs.length, insertedIds }
  }

  private async updateInternal(filter: Doc, update: Doc, options: Doc, many: boolean) {
    const targets = this.filtered(filter)
    const selected = many ? targets : targets.slice(0, 1)
    let modifiedCount = 0
    for (const doc of selected) {
      if (applyUpdate(doc, update, false)) modifiedCount++
    }
    let upsertedId: any = null
    if (selected.length === 0 && options.upsert) {
      const doc = buildUpsertDoc(filter)
      applyUpdate(doc, update, true)
      if (doc._id === undefined) doc._id = new ObjectId()
      this.docs.push(doc)
      upsertedId = doc._id
    }
    if (modifiedCount > 0 || upsertedId) this.onChange()
    return {
      acknowledged: true as const,
      matchedCount: selected.length,
      modifiedCount,
      upsertedCount: upsertedId ? 1 : 0,
      upsertedId
    }
  }

  updateOne(filter: Doc, update: Doc, options: Doc = {}) {
    return this.updateInternal(filter, update, options, false)
  }

  updateMany(filter: Doc, update: Doc, options: Doc = {}) {
    return this.updateInternal(filter, update, options, true)
  }

  replaceOne(filter: Doc, replacement: Doc, options: Doc = {}) {
    return this.updateInternal(filter, replacement, options, false)
  }

  async findOneAndUpdate(filter: Doc, update: Doc, options: Doc = {}): Promise<{ value: T | null; ok: 1 }> {
    const before = this.filtered(filter)[0]
    const snapshot = before ? clone(before) : null
    await this.updateInternal(filter, update, options, false)
    const after = this.filtered(filter)[0] ?? null
    const value = options.returnDocument === 'after' ? after : snapshot
    return { value: (value ? clone(value) : null) as T | null, ok: 1 }
  }

  async deleteOne(filter: Doc = {}): Promise<{ acknowledged: true; deletedCount: number }> {
    const index = this.docs.findIndex(doc => matchesFilter(doc, filter))
    if (index === -1) return { acknowledged: true, deletedCount: 0 }
    this.docs.splice(index, 1)
    this.onChange()
    return { acknowledged: true, deletedCount: 1 }
  }

  async deleteMany(filter: Doc = {}): Promise<{ acknowledged: true; deletedCount: number }> {
    const before = this.docs.length
    this.docs = this.docs.filter(doc => !matchesFilter(doc, filter))
    const deletedCount = before - this.docs.length
    if (deletedCount) this.onChange()
    return { acknowledged: true, deletedCount }
  }

  async countDocuments(filter: Doc = {}): Promise<number> {
    return this.filtered(filter).length
  }

  async estimatedDocumentCount(): Promise<number> {
    return this.docs.length
  }

  async createIndex(spec: Doc): Promise<string> {
    return Object.entries(spec).map(([k, v]) => `${k}_${v}`).join('_')
  }

  async createIndexes(specs: Doc[]): Promise<string[]> {
    return Promise.all(specs.map(s => this.createIndex(s.key ?? s)))
  }

  async indexes(): Promise<Doc[]> {
    return [{ name: '_id_', key: { _id: 1 } }]
  }

  async distinct(key: string, filter: Doc = {}): Promise<unknown[]> {
    const seen: unknown[] = []
    for (const doc of this.filtered(filter)) {
      for (const value of getPathValues(doc, key)) {
        if (value !== undefined && !seen.some(s => valuesEqual(s, value))) seen.push(clone(value))
      }
    }
    return seen
  }

  aggregate(pipeline: Doc[]): MemoryCursor<Doc> {
    return new MemoryCursor<Doc>(() => runPipeline(this.docs.map(clone), pipeline))
  }

  async drop(): Promise<boolean> {
    this.docs = []
    this.onChange()
    return true
  }
}

// ---------- aggregation (small subset) ----------

function resolveExpr(doc: Doc, expr: unknown): unknown {
  if (typeof expr === 'string' && expr.startsWith('$')) return getPath(doc, expr.slice(1))
  return expr
}

function runPipeline(docs: Doc[], pipeline: Doc[]): Doc[] {
  let current = docs
  for (const stage of pipeline) {
    const [op, spec] = Object.entries(stage)[0] as [string, any]
    switch (op) {
      case '$match':
        current = current.filter(doc => matchesFilter(doc, spec))
        break
      case '$sort': {
        const entries = Object.entries(spec as Doc)
        current = [...current].sort((a, b) => {
          for (const [key, dir] of entries) {
            const cmp = compareValues(getPath(a, key), getPath(b, key))
            if (cmp !== 0) return (dir as number) < 0 ? -cmp : cmp
          }
          return 0
        })
        break
      }
      case '$limit':
        current = current.slice(0, spec)
        break
      case '$skip':
        current = current.slice(spec)
        break
      case '$unwind': {
        const path = (typeof spec === 'string' ? spec : spec.path).slice(1)
        const next: Doc[] = []
        for (const doc of current) {
          const arr = getPath(doc, path)
          if (!Array.isArray(arr)) continue
          for (const item of arr) {
            const copy = clone(doc)
            setPath(copy, path, item)
            next.push(copy)
          }
        }
        current = next
        break
      }
      case '$project': {
        current = current.map(doc => {
          const out: Doc = {}
          for (const [key, value] of Object.entries(spec as Doc)) {
            if (value === 0 || value === false) continue
            if (value === 1 || value === true) {
              const v = getPath(doc, key)
              if (v !== undefined) setPath(out, key, v)
            } else {
              setPath(out, key, resolveExpr(doc, value))
            }
          }
          if (!('_id' in (spec as Doc)) && doc._id !== undefined) out._id = doc._id
          return out
        })
        break
      }
      case '$group': {
        const groups = new Map<string, Doc>()
        const order: string[] = []
        for (const doc of current) {
          const id = resolveExpr(doc, spec._id)
          const key = JSON.stringify(normalize(id) ?? null)
          let group = groups.get(key)
          if (!group) {
            group = { _id: id }
            groups.set(key, group)
            order.push(key)
          }
          for (const [field, acc] of Object.entries(spec as Doc)) {
            if (field === '_id') continue
            const [accOp, accExpr] = Object.entries(acc as Doc)[0] as [string, unknown]
            const value = resolveExpr(doc, accExpr)
            switch (accOp) {
              case '$sum':
                group[field] = (group[field] ?? 0) + (typeof value === 'number' ? value : 0)
                break
              case '$avg': {
                const meta = (group.__avg ??= {})[field] ??= { sum: 0, n: 0 }
                if (typeof value === 'number') {
                  meta.sum += value
                  meta.n++
                }
                group[field] = meta.n ? meta.sum / meta.n : null
                break
              }
              case '$max':
                if (group[field] === undefined || compareValues(value, group[field]) > 0) group[field] = value
                break
              case '$min':
                if (group[field] === undefined || compareValues(value, group[field]) < 0) group[field] = value
                break
              case '$first':
                if (!(field in group)) group[field] = value
                break
              case '$last':
                group[field] = value
                break
              case '$push':
                ;(group[field] ??= []).push(value)
                break
              case '$addToSet': {
                const set = (group[field] ??= []) as unknown[]
                if (!set.some(s => valuesEqual(s, value))) set.push(value)
                break
              }
              default:
                throw new Error(`memoryDb: unsupported accumulator ${accOp}`)
            }
          }
        }
        current = order.map(key => {
          const group = groups.get(key)!
          delete group.__avg
          return group
        })
        break
      }
      case '$count':
        current = [{ [spec as string]: current.length }]
        break
      default:
        throw new Error(`memoryDb: unsupported aggregation stage ${op}`)
    }
  }
  return current
}

// ---------- database ----------

export class MemoryDb {
  private collections = new Map<string, MemoryCollection<any>>()
  private saveTimer: NodeJS.Timeout | null = null
  private loaded: Promise<void> | null = null

  constructor(public readonly databaseName: string, private readonly snapshotFile?: string) {}

  collection<T extends Doc = Doc>(name: string): MemoryCollection<T> {
    let collection = this.collections.get(name)
    if (!collection) {
      collection = new MemoryCollection<T>(name, () => this.scheduleSave())
      this.collections.set(name, collection)
    }
    return collection
  }

  listCollections() {
    return {
      toArray: async () => Array.from(this.collections.keys()).map(name => ({ name, type: 'collection' }))
    }
  }

  async createCollection<T extends Doc = Doc>(name: string): Promise<MemoryCollection<T>> {
    return this.collection<T>(name)
  }

  async dropCollection(name: string): Promise<boolean> {
    const existed = this.collections.delete(name)
    if (existed) this.scheduleSave()
    return existed
  }

  async command(cmd: Doc): Promise<Doc> {
    if ('ping' in cmd) return { ok: 1 }
    if ('serverStatus' in cmd) return { ok: 1, host: 'memory', version: 'memory-db' }
    return { ok: 1 }
  }

  admin() {
    return {
      ping: async () => ({ ok: 1 }),
      serverStatus: async () => ({ ok: 1, host: 'memory', version: 'memory-db', uptime: process.uptime() }),
      listDatabases: async () => ({ databases: [{ name: this.databaseName, sizeOnDisk: 0, empty: false }] })
    }
  }

  async stats() {
    return {
      db: this.databaseName,
      collections: this.collections.size,
      objects: Array.from(this.collections.values()).reduce((sum, c) => sum + c._dump().length, 0)
    }
  }

  // ----- optional snapshot persistence -----

  async load(): Promise<void> {
    if (!this.snapshotFile) return
    if (!this.loaded) {
      this.loaded = (async () => {
        try {
          const raw = await fs.readFile(this.snapshotFile!, 'utf8')
          const parsed = JSON.parse(raw, reviver) as Record<string, Doc[]>
          for (const [name, docs] of Object.entries(parsed)) {
            this.collection(name)._load(docs)
          }
        } catch (error: any) {
          if (error?.code !== 'ENOENT') console.warn('[memoryDb] could not load snapshot:', error?.message)
        }
      })()
    }
    return this.loaded
  }

  private scheduleSave() {
    if (!this.snapshotFile) return
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.save().catch(error => console.warn('[memoryDb] snapshot failed:', error?.message))
    }, 750)
    // Never keep the process alive just to flush a dev snapshot.
    this.saveTimer.unref?.()
  }

  async save(): Promise<void> {
    if (!this.snapshotFile) return
    const payload: Record<string, Doc[]> = {}
    for (const [name, collection] of this.collections) payload[name] = collection._dump()
    await fs.mkdir(dirname(this.snapshotFile), { recursive: true })
    const tmp = `${this.snapshotFile}.tmp`
    await fs.writeFile(tmp, JSON.stringify(payload, replacer), 'utf8')
    await fs.rename(tmp, this.snapshotFile)
  }
}

function replacer(this: Doc, key: string, value: unknown) {
  const raw = this[key]
  if (raw instanceof Date) return { $date: raw.toISOString() }
  if (raw instanceof ObjectId) return { $oid: raw.toHexString() }
  return value
}

function reviver(_key: string, value: unknown) {
  if (isPlainObject(value)) {
    if (typeof value.$date === 'string' && Object.keys(value).length === 1) return new Date(value.$date)
    if (typeof value.$oid === 'string' && Object.keys(value).length === 1) return new ObjectId(value.$oid)
  }
  return value
}
