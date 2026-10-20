import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcChannel, type RendererApi } from '@shared/ipc';

const allowedChannels = new Set<string>(IPC_CHANNELS);

const api: RendererApi = {
  invoke: (channel: IpcChannel, ...args: unknown[]) => {
    if (!allowedChannels.has(channel)) {
      return Promise.reject(new Error(`Unknown channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, args[0]);
  },
};

contextBridge.exposeInMainWorld('api', api);
