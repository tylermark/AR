export interface Annotation {
  id: string
  label: string
  position: { x: number; y: number; z: number }
  metadata: Record<string, string>
}

export interface Model {
  id: string
  name: string
  file_url: string
  created_at: string
  annotations: Annotation[]
  company_id?: string
}

export interface UploadResponse {
  id: string
  name: string
  file_url: string
  created_at: string
  annotations: Annotation[]
  ifcEnriched?: number
  glbOnly?: number
}

export interface Company {
  id: string
  name: string
  plan: 'free' | 'pro' | 'enterprise'
  subscription_status: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  created_at: string
}

export interface Profile {
  id: string
  company_id: string
  full_name?: string
  created_at: string
}
