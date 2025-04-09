import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application'

// TODO: handle existing filename/path. Don't overwrite it, just add an incrementing number to the end?
// TODO: using Zod or an existing JSONSchema, validate that the notebook data is valid before attempting to create the notebook

const JUPYTERLITE_DATABASE = "JupyterLite Storage"
const JUPYTERLITE_STORE = 'files'

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-notebook-from-json-extension:plugin',
  description:
    'An extension from preloading JupyterLite notebooks into a users browser',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log(
      'JupyterLab extension jupyter-notebook-from-json-extension is activated!'
    );

    window.addEventListener('message', async event => {
      const { data } = event
      
      if (!data?.type || data.type !== 'load-notebook') {
        // this message is not the right type, ignore it
        return
      }

      if (!data.notebook || !data.filename) {
        // TODO: clean up validation, make sure filename is valid (has .ipynb and no directory)
        throw new Error(`Can't load notebook: either notebook or filename are missing`)
      }

      console.log('caught a message! ', event);

      saveNotebookToIndexedDB(JUPYTERLITE_DATABASE, JUPYTERLITE_STORE, data.filename, data.notebook)
        .then(res => console.log(res))
        .catch(err => console.error(err))
    });
  }
};

function saveNotebookToIndexedDB(dbName: string, storeName: string, key: string, notebookData: any) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);

    request.onerror = (event: any) => {
      reject(`Error opening IndexedDB: ${event?.target?.errorCode}`);
    };

    request.onsuccess = (event: any) => {
      console.log('success ', event)
      const db = event.target.result;
      const transaction = db.transaction([storeName], "readwrite");
      const objectStore = transaction.objectStore(storeName);

      const putRequest = objectStore.put(notebookData, key);

      console.log(db, transaction, objectStore, putRequest)

      putRequest.onsuccess = () => {
        resolve(`Notebook "${key}" saved successfully.`);
      };

      putRequest.onerror = (event: any) => {
        reject(`Failed to save notebook: ${event?.target?.errorCode}`);
      };
    };
  });
}

export default plugin;
