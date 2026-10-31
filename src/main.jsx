import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/Auth.jsx'
import { CartProvider } from './context/Cart.jsx'
import './index.css'
import { StoreProvider } from './context/Store.jsx'
createRoot(document.getElementById('root')).render(
  <BrowserRouter><AuthProvider><CartProvider><StoreProvider><App /></StoreProvider></CartProvider></AuthProvider></BrowserRouter>
)
