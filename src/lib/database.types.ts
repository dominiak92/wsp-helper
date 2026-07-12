export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

interface PersonnelRow {
  id: string
  name: string
  roles: string[]
  preferred_vehicle_id: string | null
  absence: string | null
  login: string | null
  is_soldier: boolean
  hours_seed: number
  rank: string | null
  created_at: string
}

interface PersonnelInsert {
  id: string
  name: string
  roles: string[]
  preferred_vehicle_id?: string | null
  absence?: string | null
  login?: string | null
  is_soldier?: boolean
  hours_seed?: number
  rank?: string | null
}

interface WorkHoursRow {
  person_id: string
  date: string
  code: string
  updated_at: string
}

interface WorkHoursInsert {
  person_id: string
  date: string
  code: string
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

interface DutyMessageRow {
  id: string
  sender_login: string
  sender_name: string | null
  message: string
  created_at: string
  read_at: string | null
}

interface DutyMessageInsert {
  sender_login: string
  sender_name?: string | null
  message: string
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
      duty_messages: {
        Row: DutyMessageRow
        Insert: DutyMessageInsert
        Update: Partial<DutyMessageInsert>
      }
      work_hours: {
        Row: WorkHoursRow
        Insert: WorkHoursInsert
        Update: Partial<WorkHoursInsert>
      }
    }
  }
}
