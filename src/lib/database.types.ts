export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

interface PersonnelRow {
  id: string
  name: string
  roles: string[]
  preferred_vehicle_id: string | null
  absence: string | null
  login: string | null
  created_at: string
}

interface PersonnelInsert {
  id: string
  name: string
  roles: string[]
  preferred_vehicle_id?: string | null
  absence?: string | null
  login?: string | null
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

interface AnnouncementRow {
  id: number
  message: string | null
  updated_at: string
  updated_by: string | null
}

interface AnnouncementInsert {
  id?: number
  message?: string | null
  updated_by?: string | null
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
      announcements: {
        Row: AnnouncementRow
        Insert: AnnouncementInsert
        Update: Partial<AnnouncementInsert>
      }
    }
  }
}
