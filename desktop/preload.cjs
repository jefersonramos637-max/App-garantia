'use strict'
// Ponte mínima e segura entre as telas e o programa: só expõe a atualização.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('garantiasDesktop', {
  estadoAtualizacao: () => ipcRenderer.invoke('atualizacao:estado'),
  verificarAtualizacao: () => ipcRenderer.invoke('atualizacao:verificar'),
  instalarAtualizacao: () => ipcRenderer.invoke('atualizacao:instalar'),
  aoMudarAtualizacao: (retorno) => {
    const ouvinte = (_evento, estado) => retorno(estado)
    ipcRenderer.on('atualizacao:estado', ouvinte)
    return () => ipcRenderer.removeListener('atualizacao:estado', ouvinte)
  },
})
