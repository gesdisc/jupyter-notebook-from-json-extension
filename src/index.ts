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

const log = (...args: any[]) => {
  console.log('[NotebookFromJSON]', ...args);
};

async function activatePlugin(app: JupyterFrontEnd) {
  log(
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

    log('Load notebook event caught: ', event);

    // we don't allow the user to pass in a whole notebook, but rather just the filename and the cells
    // we lock the rest to make sure we are using a consistent Python version and kernel
    const notebookContent = {
      metadata: {
        // hardcoding the usage of Python as the kernel as well as locking the Python versions
        kernelspec: {
          name: 'python',
          display_name: 'Python (Pyodide)',
          language: 'python'
        },
        language_info: {
          codemirror_mode: {
            name: 'python',
            version: 3
          },
          file_extension: '.py',
          mimetype: 'text/x-python',
          name: 'python',
          nbconvert_exporter: 'python',
          pygments_lexer: 'ipython3',
          version: '3.8'
        }
      },
      nbformat_minor: 5,
      nbformat: 4,
      cells: data.notebook, // the user's requested cells
    }

    await saveNotebookToIndexedDB(
      JUPYTERLITE_DATABASE,
      JUPYTERLITE_STORE,
      data.filename,
      {
        size: new TextEncoder().encode(JSON.stringify(notebookContent)).length,
        name: data.filename,
        path: data.filename,
        last_modified: new Date().toISOString(),
        created: new Date().toISOString(),
        format: 'json',
        mimetype: 'application/json',
        content: notebookContent,
        writable: true,
        type: 'notebook'
      }
    );

    log(`Notebook "${data.filename}" saved successfully.`);

    await waitForCommand('docmanager:open', app);

    app.commands.execute('docmanager:open', {
      path: data.filename,
      factory: 'Notebook'
    }).then((a: any) => {
      // defer to the next event loop so the panel is active
      requestAnimationFrame(() => {
        const panel = app.shell.currentWidget as any;

        log('Notebook panel is active')


        panel.sessionContext.ready.then(() => {
          log('Lernel is ready, running all cells in notebook')
          app.commands.execute('notebook:run-all-cells');
        });
      });
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
  return new Promise<void>(resolve => {
    const maxWait = 10 * 1000; // 10 sec
    const checkWait = 100; // check every 100ms
    let totalWait = 0;

    const interval = setInterval(() => {
      totalWait += checkWait;

      if (totalWait >= maxWait) {
        throw new Error(`Command ${commandId} never registered`);
      }

      if (app.commands.hasCommand(commandId)) {
        clearInterval(interval);
        resolve();
      }
    }, checkWait);
  });
}

export default plugin;
