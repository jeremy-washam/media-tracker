import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LibraryReviewApp } from './app'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LibraryReviewApp />
  </StrictMode>,
)
