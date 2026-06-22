// Auto-generated types matching supabase/migrations/001_initial_schema.sql
// Re-generate with: supabase gen types typescript --local > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          name: string
          nif: string | null
          email: string | null
          phone: string | null
          address: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id'|'created_at'|'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }
      client_templates: {
        Row: {
          id: string
          client_id: string
          name: string
          file_path: string | null
          field_map: Json | null
          photo_config: Json | null
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['client_templates']['Row'], 'id'|'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['client_templates']['Insert']>
      }
      portfolios: {
        Row: {
          id: string
          client_id: string
          name: string
          description: string | null
          deadline: string | null
          status: 'active' | 'completed' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['portfolios']['Row'], 'id'|'created_at'|'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['portfolios']['Insert']>
      }
      properties: {
        Row: {
          id: string
          portfolio_id: string
          client_id: string
          ref: string
          external_ref: string | null
          address: string | null
          parish: string | null
          municipality: string | null
          district: string | null
          postal_code: string | null
          coordinates: unknown | null
          property_type: string | null
          typology: string | null
          gross_area: number | null
          useful_area: number | null
          land_area: number | null
          floor: number | null
          year_built: number | null
          condition: string | null
          datatape_data: Json
          visit_status: 'pending' | 'scheduled' | 'visited' | 'report_done'
          visit_date: string | null
          visit_notes: string | null
          billing_status: 'no_po' | 'awaiting_po' | 'po_received' | 'invoice_pending' | 'invoice_issued' | 'paid'
          fee_amount: number | null
          po_number: string | null
          po_date: string | null
          invoice_number: string | null
          invoice_date: string | null
          payment_date: string | null
          report_path: string | null
          report_generated_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['properties']['Row'], 'id'|'created_at'|'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['properties']['Insert']>
      }
      property_photos: {
        Row: {
          id: string
          property_id: string
          storage_path: string
          original_name: string | null
          size_bytes: number | null
          width: number | null
          height: number | null
          taken_at: string | null
          sort_order: number
          caption: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['property_photos']['Row'], 'id'|'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['property_photos']['Insert']>
      }
      market_comps: {
        Row: {
          id: string
          property_id: string
          portal: string
          listing_ref: string | null
          url: string | null
          address: string | null
          typology: string | null
          area_m2: number | null
          price: number | null
          price_per_m2: number | null
          listing_date: string | null
          is_sold: boolean
          notes: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['market_comps']['Row'], 'id'|'created_at'|'price_per_m2'> & { id?: string }
        Update: Partial<Database['public']['Tables']['market_comps']['Insert']>
      }
      datatape_imports: {
        Row: {
          id: string
          portfolio_id: string
          file_name: string | null
          storage_path: string | null
          row_count: number | null
          imported_count: number | null
          errors: Json | null
          imported_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['datatape_imports']['Row'], 'id'|'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['datatape_imports']['Insert']>
      }
    }
  }
}

// Convenience types
export type Client      = Database['public']['Tables']['clients']['Row']
export type Portfolio   = Database['public']['Tables']['portfolios']['Row']
export type Property    = Database['public']['Tables']['properties']['Row']
export type Photo       = Database['public']['Tables']['property_photos']['Row']
export type MarketComp  = Database['public']['Tables']['market_comps']['Row']
export type Template    = Database['public']['Tables']['client_templates']['Row']

export type VisitStatus   = Property['visit_status']
export type BillingStatus = Property['billing_status']

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  pending:     'Por visitar',
  scheduled:   'Agendado',
  visited:     'Visitado',
  report_done: 'Report OK',
}

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  no_po:           'Sem PO',
  awaiting_po:     'A aguardar PO',
  po_received:     'PO recebida',
  invoice_pending: 'Fatura por emitir',
  invoice_issued:  'Fatura emitida',
  paid:            'Pago',
}
