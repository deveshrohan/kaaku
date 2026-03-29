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
  gmailConnect:    ()  => ipcRenderer.invoke('gmail:connect'),
  gmailDisconnect: ()  => ipcRenderer.invoke('gmail:disconnect'),
  gmailSync:       ()  => ipcRenderer.invoke('gmail:sync'),
  // Integration tests
  testJira:   ()  => ipcRenderer.invoke('jira:test'),
  testRedash: ()  => ipcRenderer.invoke('redash:test'),
  testGithub: ()  => ipcRenderer.invoke('github:test'),
  // Agent
  startAgent:     (type, input)             => ipcRenderer.invoke('agent:start', type, input),
  cancelAgent:    (runId)                    => ipcRenderer.invoke('agent:cancel', runId),
  approveDraft:   (runId, draftId)           => ipcRenderer.invoke('agent:approve-draft', runId, draftId),
  rejectDraft:    (runId, draftId, reason)   => ipcRenderer.invoke('agent:reject-draft', runId, draftId, reason),
  replyToAgent:   (runId, askId, message)   => ipcRenderer.invoke('agent:reply', runId, askId, message),
  listAgentRuns:  ()                         => ipcRenderer.invoke('agent:list-runs'),
  getAgentRun:    (runId)                    => ipcRenderer.invoke('agent:get-run', runId),
  onAgentRouted: (cb) => {
    const handler = (_, runId, routeInfo) => cb(runId, routeInfo)
    ipcRenderer.on('agent:routed', handler)
    return () => ipcRenderer.removeListener('agent:routed', handler)
  },
  onAgentStep: (cb) => {
    const handler = (_, runId, step) => cb(runId, step)
    ipcRenderer.on('agent:step-update', handler)
    return () => ipcRenderer.removeListener('agent:step-update', handler)
  },
  onAgentDraft: (cb) => {
    const handler = (_, runId, draft) => cb(runId, draft)
    ipcRenderer.on('agent:draft', handler)
    return () => ipcRenderer.removeListener('agent:draft', handler)
  },
  onAgentAskUser: (cb) => {
    const handler = (_, runId, ask) => cb(runId, ask)
    ipcRenderer.on('agent:ask-user', handler)
    return () => ipcRenderer.removeListener('agent:ask-user', handler)
  },
  onAgentCompleted: (cb) => {
    const handler = (_, runId, result) => cb(runId, result)
    ipcRenderer.on('agent:completed', handler)
    return () => ipcRenderer.removeListener('agent:completed', handler)
  },
  onAgentFailed: (cb) => {
    const handler = (_, runId, error) => cb(runId, error)
    ipcRenderer.on('agent:failed', handler)
    return () => ipcRenderer.removeListener('agent:failed', handler)
  },
  onAgentDelegation: (cb) => {
    const handler = (_, runId, info) => cb(runId, info)
    ipcRenderer.on('agent:delegation', handler)
    return () => ipcRenderer.removeListener('agent:delegation', handler)
  },
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
  onSyncStatus: (cb) => {
    const handler = (_, status) => cb(status)
    ipcRenderer.on('sync:status', handler)
    return () => ipcRenderer.removeListener('sync:status', handler)
  },
  // Agent evals
  getEvalStats:      ()  => ipcRenderer.invoke('agent:eval-stats'),
  // Trapdoor hide/show
  trapdoorHideComplete: () => ipcRenderer.invoke('trapdoor:hide-complete'),
  requestTrapdoorHide:  () => ipcRenderer.send('trapdoor:request-hide'),
  onTrapdoorStartHide: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('trapdoor:start-hide', handler)
    return () => ipcRenderer.removeListener('trapdoor:start-hide', handler)
  },
  onTrapdoorStartShow: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('trapdoor:start-show', handler)
    return () => ipcRenderer.removeListener('trapdoor:start-show', handler)
  },
})
