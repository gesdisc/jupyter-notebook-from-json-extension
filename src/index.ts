import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application'

// TODO: handle existing filename/path. Don't overwrite it, just add an incrementing number to the end?
// TODO: using Zod or an existing JSONSchema, validate that the notebook data is valid before attempting to create the notebook
// TODO: optional open notebook on save?

const JUPYTERLITE_DATABASE = 'JupyterLite Storage';
const JUPYTERLITE_STORE = 'files';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-notebook-from-json-extension:plugin',
  description:
    'An extension from preloading JupyterLite notebooks into a users browser',
  autoStart: true,
  activate: activatePlugin
};

async function activatePlugin(app: JupyterFrontEnd) {
  console.log(
    'JupyterLab extension jupyter-notebook-from-json-extension is activated!'
  );

  window.addEventListener('message', async event => {
    const { data } = event;

    if (!data?.type || data.type !== 'load-notebook') {
      // this message is not the right type, ignore it
      return;
    }

    if (!data.notebook || !data.filename) {
      // TODO: clean up validation, make sure filename is valid (has .ipynb and no directory)
      throw new Error(
        "Can't load notebook: either notebook or filename are missing"
      );
    }

    console.log('Load notebook event caught: ', event);

    await saveNotebookToIndexedDB(
      JUPYTERLITE_DATABASE,
      JUPYTERLITE_STORE,
      data.filename,
      data.notebook
    );

    console.log(`Notebook "${data.filename}" saved successfully.`);

    await waitForCommand('docmanager:open', app);

    app.commands.execute('docmanager:open', {
      path: data.filename,
      factory: 'Notebook'
    });
  });
}

function saveNotebookToIndexedDB(
  dbName: string,
  storeName: string,
  key: string,
  notebookData: any
) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(dbName);

    request.onerror = (event: any) => {
      reject(`Error opening IndexedDB: ${event?.target?.errorCode}`);
    };

    request.onsuccess = (event: any) => {
      const db = event.target.result;
      const transaction = db.transaction([storeName], 'readwrite');
      const objectStore = transaction.objectStore(storeName);
      const putRequest = objectStore.put(notebookData, key);

      putRequest.onsuccess = () => {
        resolve();
      };

      putRequest.onerror = (event: any) => {
        reject(`Failed to save notebook: ${event?.target?.errorCode}`);
      };
    };
  });
}

function waitForCommand(commandId: string, app: JupyterFrontEnd) {
  return new Promise<void>((resolve) => {
    const maxWait = 10 * 1000 // 10 sec
    const checkWait = 100 // check every 100ms
    let totalWait = 0

    const interval = setInterval(() => {
      totalWait += checkWait

      if (totalWait >= maxWait) {
        throw new Error(`Command ${commandId} never registered`)
      }

      if (app.commands.hasCommand(commandId)) {
        clearInterval(interval);
        resolve();
      }
    }, checkWait);
  })
}

export default plugin;
