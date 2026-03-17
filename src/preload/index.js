import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('wallE', {
  moveWindow:    (delta) => ipcRenderer.invoke('move-window', delta),
  ignoreMouse:   (v)     => ipcRenderer.send('ignore-mouse', v),
  setPanelOpen:  (open)  => ipcRenderer.invoke('set-panel-open', open),
  setBubbleOpen: (open)  => ipcRenderer.invoke('set-bubble-open', open),
  loadTodos:     ()      => ipcRenderer.invoke('todos:load'),
  saveTodos:     (todos) => ipcRenderer.invoke('todos:save', todos),
  loadSettings:  ()      => ipcRenderer.invoke('settings:load'),
  saveSettings:  (cfg)   => ipcRenderer.invoke('settings:save', cfg),
  syncSlack:     ()      => ipcRenderer.invoke('slack:sync'),
  diagnoseSlack:    ()   => ipcRenderer.invoke('slack:diagnose'),
  clearProcessedIds:    ()           => ipcRenderer.invoke('slack:clear-processed'),
  respondPermission:    (id, action) => ipcRenderer.invoke('permission:respond', { id, action }),
  onTodosPushed: (cb) => {
    const handler = (_, todos) => cb(todos)
    ipcRenderer.on('todos:pushed', handler)
    return () => ipcRenderer.removeListener('todos:pushed', handler)
  },
  onTodosResolved: (cb) => {
    const handler = (_, ids) => cb(ids)
    ipcRenderer.on('todos:resolved', handler)
    return () => ipcRenderer.removeListener('todos:resolved', handler)
  },
})
