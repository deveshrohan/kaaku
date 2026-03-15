import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('wallE', {
  moveWindow:    (delta) => ipcRenderer.invoke('move-window', delta),
  setPanelOpen:  (open)  => ipcRenderer.invoke('set-panel-open', open),
  loadTodos:     ()      => ipcRenderer.invoke('todos:load'),
  saveTodos:     (todos) => ipcRenderer.invoke('todos:save', todos),
  loadSettings:  ()      => ipcRenderer.invoke('settings:load'),
  saveSettings:  (cfg)   => ipcRenderer.invoke('settings:save', cfg),
  syncSlack:     ()      => ipcRenderer.invoke('slack:sync'),
  diagnoseSlack: ()      => ipcRenderer.invoke('slack:diagnose'),
  onTodosPushed: (cb)    => {
    const handler = (_, todos) => cb(todos)
    ipcRenderer.on('todos:pushed', handler)
    return () => ipcRenderer.removeListener('todos:pushed', handler)
  },
})
