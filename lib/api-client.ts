/**
 * Utility for making authenticated API calls with server access code
 * Use this for server-to-server communication that bypasses domain restrictions
 */

interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: any
  headers?: Record<string, string>
  useServerAccessCode?: boolean
}

export async function makeApiCall(
  endpoint: string, 
  options: ApiClientOptions = {}
): Promise<any> {
  const {
    method = 'GET',
    data,
    headers = {},
    useServerAccessCode = false
  } = options

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const url = endpoint.startsWith('/') ? `${baseUrl}${endpoint}` : `${baseUrl}/${endpoint}`

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  }

  // Add server access code if requested
  if (useServerAccessCode && process.env.SERVER_ACCESS_CODE) {
    fetchOptions.headers = {
      ...fetchOptions.headers,
      'x-access-code': process.env.SERVER_ACCESS_CODE
    }
  }

  // Add body for POST/PUT requests
  if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
    fetchOptions.body = JSON.stringify(data)
  }

  try {
    const response = await fetch(url, fetchOptions)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `API call failed: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error(`API call failed for ${endpoint}:`, error)
    throw error
  }
}

// Convenience methods
export const apiClient = {
  get: (endpoint: string, options?: Omit<ApiClientOptions, 'method'>) => 
    makeApiCall(endpoint, { ...options, method: 'GET' }),
    
  post: (endpoint: string, data: any, options?: Omit<ApiClientOptions, 'method' | 'data'>) => 
    makeApiCall(endpoint, { ...options, method: 'POST', data }),
    
  put: (endpoint: string, data: any, options?: Omit<ApiClientOptions, 'method' | 'data'>) => 
    makeApiCall(endpoint, { ...options, method: 'PUT', data }),
    
  delete: (endpoint: string, options?: Omit<ApiClientOptions, 'method'>) => 
    makeApiCall(endpoint, { ...options, method: 'DELETE' }),
}

// Server-side authenticated client (automatically includes server access code)
export const serverApiClient = {
  get: (endpoint: string, options?: Omit<ApiClientOptions, 'method' | 'useServerAccessCode'>) => 
    makeApiCall(endpoint, { ...options, method: 'GET', useServerAccessCode: true }),
    
  post: (endpoint: string, data: any, options?: Omit<ApiClientOptions, 'method' | 'data' | 'useServerAccessCode'>) => 
    makeApiCall(endpoint, { ...options, method: 'POST', data, useServerAccessCode: true }),
    
  put: (endpoint: string, data: any, options?: Omit<ApiClientOptions, 'method' | 'data' | 'useServerAccessCode'>) => 
    makeApiCall(endpoint, { ...options, method: 'PUT', data, useServerAccessCode: true }),
    
  delete: (endpoint: string, options?: Omit<ApiClientOptions, 'method' | 'useServerAccessCode'>) => 
    makeApiCall(endpoint, { ...options, method: 'DELETE', useServerAccessCode: true }),
}