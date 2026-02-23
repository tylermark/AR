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
