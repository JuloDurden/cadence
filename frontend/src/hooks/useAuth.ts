import { useState } from 'react'

const TOKEN_KEY = 'cadence_token'

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))

  function login(jwt: string) {
    localStorage.setItem(TOKEN_KEY, jwt)
    setToken(jwt)
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }

  return { token, login, logout }
}
