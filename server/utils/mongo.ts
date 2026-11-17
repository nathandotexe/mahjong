import { MongoClient, Db, Collection, type Document } from 'mongodb'
import 'dotenv/config'
import { MemoryDb } from './memoryDb'

// Cache the client/db across hot-reloads in dev and across route calls
// so we don't create multiple connections.
type GlobalWithMongo = typeof globalThis & {
	_mongoClient?: MongoClient
	_mongoDb?: Db
	_memoryDb?: MemoryDb
	_dbModeLogged?: boolean
}

const g = globalThis as GlobalWithMongo

/**
 * Database mode:
 *  - `MONGODB_URI` set to a mongodb:// URI  -> real MongoDB (production path, unchanged)
 *  - `MONGODB_URI` unset or `memory`        -> zero-dependency in-memory store (dev / tests)
 *  - connection failure outside production  -> warn and fall back to the in-memory store
 */
export function isMemoryMode(): boolean {
	const uri = process.env.MONGODB_URI
	return !uri || uri === 'memory' || uri === 'mem'
}

function getDefaultDbName(): string {
	return process.env.MONGODB_DB || 'blood_on_mahjong'
}

function logModeOnce(message: string) {
	if (g._dbModeLogged) return
	g._dbModeLogged = true
	console.log(message)
}

async function getMemoryDb(): Promise<MemoryDb> {
	if (!g._memoryDb) {
		const snapshot = process.env.MEMORY_DB_FILE || (process.env.NODE_ENV === 'test' ? undefined : '.data/memory-db.json')
		g._memoryDb = new MemoryDb(getDefaultDbName(), snapshot)
		await g._memoryDb.load()
		logModeOnce(
			`💾 Database: in-memory store${snapshot ? ` (snapshot: ${snapshot})` : ''}. ` +
				'Set MONGODB_URI to use MongoDB.'
		)
	}
	return g._memoryDb
}

export async function getMongoClient(): Promise<MongoClient> {
	if (g._mongoClient) return g._mongoClient

	if (isMemoryMode()) {
		throw new Error('getMongoClient() is unavailable in memory mode; use getDb()/getCollection().')
	}

	const client = new MongoClient(process.env.MONGODB_URI!)
	// Ensure the connection is valid by pinging admin
	await client.db('admin').command({ ping: 1 })
	g._mongoClient = client
	logModeOnce('💾 Database: MongoDB connected')
	return client
}

export async function getDb(dbName?: string): Promise<Db> {
	if (g._mongoDb && (!dbName || g._mongoDb.databaseName === dbName)) {
		return g._mongoDb
	}

	if (isMemoryMode()) {
		if (process.env.VERCEL) {
			// Each serverless instance would get its own empty store and its filesystem is read-only,
			// so players would not see each other's rooms and everything would vanish on cold start.
			throw new Error(
				'MONGODB_URI is not set. On Vercel the in-memory store cannot work: add a MongoDB connection ' +
					'string (e.g. a free MongoDB Atlas cluster) under Project Settings → Environment Variables.'
			)
		}
		return (await getMemoryDb()) as unknown as Db
	}

	try {
		const client = await getMongoClient()
		const db = client.db(dbName || getDefaultDbName())
		g._mongoDb = db
		return db
	} catch (error: any) {
		if (process.env.NODE_ENV === 'production') throw error
		console.warn(
			`⚠️  Could not connect to MongoDB (${error?.message || error}). ` +
				'Falling back to the in-memory store for this dev session.'
		)
		process.env.MONGODB_URI = 'memory'
		return (await getMemoryDb()) as unknown as Db
	}
}

export async function getCollection<T extends Document = Document>(
	name: string,
	dbName?: string
): Promise<Collection<T>> {
	const db = await getDb(dbName)
	return db.collection<T>(name)
}

// Optional helper to gracefully close the client; not used in serverless/edge
// but can be called in tests or scripts.
export async function closeMongo(): Promise<void> {
	if (g._mongoClient) {
		await g._mongoClient.close()
		g._mongoClient = undefined
		g._mongoDb = undefined
	}
	if (g._memoryDb) {
		await g._memoryDb.save().catch(() => {})
		g._memoryDb = undefined
	}
}

export type { Db, MongoClient, Collection }
