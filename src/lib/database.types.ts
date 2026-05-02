export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      personnel: {
        Row: {
          id: string
          name: string
          roles: string[]
          preferred_vehicle_id: string | null
          absence: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['personnel']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['personnel']['Insert']>
      }
      duty_assignments: {
        Row: {
          id: string
          duty_date: string
          assignment_json: Json
          created_at: string
          updated_at: string
        }
        Insert: Pick<Database['public']['Tables']['duty_assignments']['Row'], 'duty_date' | 'assignment_json'>
        Update: Pick<Database['public']['Tables']['duty_assignments']['Row'], 'duty_date' | 'assignment_json'>
      }
    }
  }
}
