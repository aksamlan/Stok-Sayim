const DB_VERSION = 2

export function openIdb(storeId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`magaza_${storeId}`, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("catalog")) {
        db.createObjectStore("catalog", { keyPath: "barcode" })
      }
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains("mine")) {
        db.createObjectStore("mine", { keyPath: "key" })
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" })
      }
      // v2: kapatılmış sayıma gönderilemeyen okutmaların emanet deposu —
      // hiçbir okutma sessizce yok olmaz, CSV olarak kurtarılabilir.
      if (!db.objectStoreNames.contains("dead")) {
        db.createObjectStore("dead", { keyPath: "id" })
      }
    }
    req.onsuccess = () => {
      const db = req.result
      // Başka sekme sürüm yükseltirse bu bağlantı kapanmalı ki yükseltme
      // sonsuza dek bloklanmasın.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    // Eski sürümü açık tutan başka bir sekme yükseltmeyi bloklarsa sonsuza
    // dek bekleme: anlaşılır bir hatayla çık (çağıran taraf kullanıcıya söyler).
    req.onblocked = () =>
      reject(
        new Error("Depolama başka bir sekme tarafından kilitli — diğer sekmeleri kapatıp yenile")
      )
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

export function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function idbPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  const tx = db.transaction(store, "readwrite")
  tx.objectStore(store).put(value)
  await txDone(tx)
}

export async function idbDelete(db: IDBDatabase, store: string, keys: string[]): Promise<void> {
  const tx = db.transaction(store, "readwrite")
  for (const key of keys) tx.objectStore(store).delete(key)
  await txDone(tx)
}

export async function idbClear(db: IDBDatabase, store: string): Promise<void> {
  const tx = db.transaction(store, "readwrite")
  tx.objectStore(store).clear()
  await txDone(tx)
}

export async function idbBulkPut(
  db: IDBDatabase,
  store: string,
  values: unknown[]
): Promise<void> {
  const CHUNK = 2000
  for (let i = 0; i < values.length; i += CHUNK) {
    const tx = db.transaction(store, "readwrite")
    const os = tx.objectStore(store)
    for (const v of values.slice(i, i + CHUNK)) os.put(v)
    await txDone(tx)
  }
}
