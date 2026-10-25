export type StoredRecording = {
  id: string
  name: string
  date: string
  blob: Blob
}

const DB_NAME = 'JalVaaniDB'
const STORE_NAME = 'recordings'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveRecording(
  recording: StoredRecording
): Promise<void> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(recording)

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }

    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }

    transaction.onabort = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

export async function getRecordings(): Promise<StoredRecording[]> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).getAll()

    request.onsuccess = () => {
      const recordings = request.result as StoredRecording[]
      recordings.sort((a, b) => b.date.localeCompare(a.date))
      db.close()
      resolve(recordings)
    }

    request.onerror = () => {
      db.close()
      reject(request.error)
    }

    transaction.onabort = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }

    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }

    transaction.onabort = () => {
      db.close()
      reject(transaction.error)
    }
  })
}