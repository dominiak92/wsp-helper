export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

interface PersonnelRow {
  id: string
  name: string
  roles: string[]
  preferred_vehicle_id: string | null
  absence: string | null
  created_at: string
}

interface PersonnelInsert {
  id: string
  name: string
  roles: string[]
  preferred_vehicle_id?: string | null
  absence?: string | null
}

interface DutyAssignmentRow {
  id: string
  duty_date: string
  assignment_json: Json
  created_at: string
  updated_at: string
}

interface DutyAssignmentInsert {
  duty_date: string
  assignment_json: Json
}

export interface Database {
  public: {
    Tables: {
      personnel: {
        Row: PersonnelRow
        Insert: PersonnelInsert
        Update: Partial<PersonnelInsert>
      }
      duty_assignments: {
        Row: DutyAssignmentRow
        Insert: DutyAssignmentInsert
        Update: Partial<DutyAssignmentInsert>
      }
    }
  }
}
