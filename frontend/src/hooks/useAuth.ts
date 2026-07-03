import { useState } from 'react'

const TOKEN_KEY = 'cadence_token'
const USER_KEY  = 'cadence_user'

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [userName, setUserName] = useState<string>(() => localStorage.getItem(USER_KEY) ?? 'Admin')

  function login(jwt: string, name?: string) {
    localStorage.setItem(TOKEN_KEY, jwt)
    setToken(jwt)
    if (name) {
      localStorage.setItem(USER_KEY, name)
      setUserName(name)
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUserName('Admin')
  }

  return { token, login, logout, userName }
}
