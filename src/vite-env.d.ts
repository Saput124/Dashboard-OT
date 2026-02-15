/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Type declaration untuk jspdf-autotable
declare module 'jspdf-autotable' {
  import { jsPDF } from 'jspdf'
  
  export default function autoTable(
    doc: jsPDF,
    options: any
  ): void
}