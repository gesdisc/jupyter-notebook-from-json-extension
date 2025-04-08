import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the jupyter-notebook-from-json-extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-notebook-from-json-extension:plugin',
  description: 'An extension from preloading JupyterLite notebooks into a users browser',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyter-notebook-from-json-extension is activated!');
  }
};

export default plugin;
