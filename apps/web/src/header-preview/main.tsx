import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HeaderPreview } from './preview'
import '../styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HeaderPreview />
  </StrictMode>,
)
