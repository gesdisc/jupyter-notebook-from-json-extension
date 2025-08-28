import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application'
import { IndexedDBManager } from './indexeddb'

// TODO: handle existing filename/path. Don't overwrite it, just add an incrementing number to the end?
// TODO: using Zod or an existing JSONSchema, validate that the notebook data is valid before attempting to create the notebook

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

    log('Got a message', data);

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

    // Store time series data if provided
    if (data.timeSeriesData && data.databaseName && data.storeName) {
      try {
        const dbManager = new IndexedDBManager(data.databaseName, data.storeName);
        await dbManager.storeData(data.timeSeriesData.key, data.timeSeriesData);
        log(`Time series data stored successfully with key: ${data.timeSeriesData.key}`);
      } catch (err) {
        console.error('Failed to store time series data:', err);
      }
    }

    // store blob if provided
    if (data.blob) {
      try {
        const dbManager = new IndexedDBManager(data.databaseName, data.storeName);
        await dbManager.storeData(data.blob.key, data.blob);

        log(`Blob data stored successfully with key: ${data.blob.key}`);
      } catch (err) {
        console.error('Failed to store blob data:', err);
      }
    }

    if ('bearerToken' in data && data.bearerToken) {
      localStorage.setItem('terra-token', data.bearerToken);
    }

    injectLoadingOverlay();

    try {
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
        cells: data.notebook // the user's requested cells
      };

      await delay(1000)

      await saveNotebookToIndexedDB(
        JUPYTERLITE_DATABASE,
        JUPYTERLITE_STORE,
        data.filename,
        {
          size: new TextEncoder().encode(JSON.stringify(notebookContent))
            .length,
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

      log('Waiting for docmanager:open command to be available');

      await waitForCommand('docmanager:open', app);

      log('docmanager:open is available');

      const openedWidget: any = await app.commands.execute('docmanager:open', {
        path: data.filename,
        factory: 'Notebook'
      });

      // defer to the next event loop so the panel is active
      requestAnimationFrame(async () => {
        const panel: any = openedWidget ?? (app.shell.currentWidget as any);
        log('Notebook panel is active ', panel);

        const sessionContext = panel?.sessionContext ?? panel?.context?.sessionContext;
        if (!sessionContext) {
          console.warn('Opened widget has no sessionContext; waiting 5 seconds and running it manually');
          await delay(5000);
          await app.commands.execute('notebook:run-all-cells');
          return;
        }

        await sessionContext.ready;
        log('Kernel is ready, running all cells in notebook');

        await app.commands.execute('notebook:run-all-cells');

        log('All cells finished executing');

        setTimeout(() => {
          // wait a bit then hide the overlay
          removeLoadingOverlay();
        }, 3000);
      });
    } catch (err) {
      console.error('Notebook load/run failed', err);
      removeLoadingOverlay();
    }
  });

  if (window.opener) {
    window.opener.postMessage({
      type: 'jupyterlite-ready',
      timestamp: Date.now()
    }, '*');
    
    log('Sent ready signal to parent window');
  }
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

function removeLoadingOverlay() {
  const overlay = document.getElementById('jupyterlite-loading-overlay');
  if (overlay) {
    overlay.remove();
  }
}

function injectLoadingOverlay() {
  log('Injecting loading overlay ', document);
  const overlay = document.createElement('div');
  overlay.id = 'jupyterlite-loading-overlay';
  overlay.innerHTML = `
    <div class="spinner"></div>
    <p style="margin-top: 16px;">Loading notebook environment...</p>
  `;
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    background: 'rgba(255, 255, 255, 0.95)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: '9999',
    fontFamily: 'sans-serif'
  });

  const style = document.createElement('style');
  style.innerHTML = `
    .spinner {
      border: 6px solid #eee;
      border-top: 6px solid #0078D4;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(overlay);
}

function delay(milliseconds: number) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds)
  })
}

export default plugin;
