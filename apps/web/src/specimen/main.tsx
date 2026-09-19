import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Specimen } from './app'
import './styles.css'
import { applyAppearance, initialAppearance } from './themes'

const appearance = initialAppearance()
applyAppearance(appearance.theme, appearance.mode)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Specimen />
  </StrictMode>,
)
