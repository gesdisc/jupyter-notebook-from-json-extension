export class IndexedDBManager {
  constructor(
    private dbName: string,
    private storeName: string
  ) {}

  private async ensureObjectStore(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      // First try to open the database to check if it exists
      const checkRequest = indexedDB.open(this.dbName);
      
      checkRequest.onsuccess = (event: any) => {
        const db = event.target.result;
        // If the store doesn't exist, we need to upgrade
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.close();
          // Open with a higher version to trigger upgrade
          const upgradeRequest = indexedDB.open(this.dbName, db.version + 1);
          
          upgradeRequest.onupgradeneeded = (event: any) => {
            const upgradeDb = event.target.result;
            upgradeDb.createObjectStore(this.storeName, { keyPath: 'key', autoIncrement: false });
          };
          
          upgradeRequest.onsuccess = (event: any) => {
            resolve(event.target.result);
          };
          
          upgradeRequest.onerror = (event: any) => {
            reject(`Error upgrading database: ${event?.target?.errorCode}`);
          };
        } else {
          resolve(db);
        }
      };
      
      checkRequest.onerror = (event: any) => {
        reject(`Error checking database: ${event?.target?.errorCode}`);
      };
    });
  }

  async storeData(key: string, data: any): Promise<void> {
    try {
      const db = await this.ensureObjectStore();
      
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const objectStore = transaction.objectStore(this.storeName);
        const dataWithKey = { ...data, key };
        const putRequest = objectStore.put(dataWithKey);

        putRequest.onsuccess = () => {
          resolve();
        };

        putRequest.onerror = (event: any) => {
          reject(`Failed to save data: ${event?.target?.errorCode}`);
        };
      });
    } catch (error) {
      throw new Error(`Failed to ensure object store: ${error}`);
    }
  }
} 