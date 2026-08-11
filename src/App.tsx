import { useState } from 'react'

export default function App() {
  const [msg] = useState('Quantumy is updating. Backend fixes for deep tool loops (Gmail + memory) are live. Full UI restore in progress.')
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 480, margin: '40px auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Quantumy</h1>
      <p style={{ color: '#555', lineHeight: 1.5 }}>{msg}</p>
      <p style={{ marginTop: 16, fontSize: 13, color: '#888' }}>
        Empty-response fix is on the server (more tool rounds, 300s timeout, status events). Frontend stream keep-alive will be restored shortly.
      </p>
    </div>
  )
}
