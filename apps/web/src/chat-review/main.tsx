import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { ChatReview } from './review'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatReview />
  </StrictMode>,
)
