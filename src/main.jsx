import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

window.onerror = (msg, src, line, col, err) => {
  document.body.innerHTML = `<div style="padding:20px;font-family:monospace;color:red;background:#fff;word-break:break-all">
    <h3>❌ 錯誤</h3>
    <p>${msg}</p>
    <p>${src}:${line}</p>
    <pre>${err?.stack||''}</pre>
  </div>`;
};

window.onunhandledrejection = (e) => {
  document.body.innerHTML = `<div style="padding:20px;font-family:monospace;color:red;background:#fff;word-break:break-all">
    <h3>❌ Promise 錯誤</h3>
    <pre>${e.reason?.stack || e.reason || e}</pre>
  </div>`;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
