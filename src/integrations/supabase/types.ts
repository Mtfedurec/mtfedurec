export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string | null;
          staff_number: string | null;
          phone: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name?: string;
          email?: string | null;
          staff_number?: string | null;
          phone?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string | null;
          staff_number?: string | null;
          phone?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [{ foreignKeyName: "profiles_id_fkey"; columns: ["id"]; isOneToOne: true; referencedRelation: "users"; referencedColumns: ["id"] }];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: "admin" | "head_teacher" | "teacher";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: "admin" | "head_teacher" | "teacher";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: "admin" | "head_teacher" | "teacher";
          created_at?: string;
        };
        Relationships: [{ foreignKeyName: "user_roles_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }];
      };
      school_settings: {
        Row: {
          id: string;
          name: string;
          motto: string | null;
          address: string | null;
          phone: string | null;
          email: string | null;
          logo_url: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          motto?: string | null;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          motto?: string | null;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      academic_sessions: {
        Row: {
          id: string;
          name: string;
          start_date: string | null;
          end_date: string | null;
          is_current: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      terms: {
        Row: {
          id: string;
          session_id: string;
          name: string;
          start_date: string | null;
          end_date: string | null;
          is_current: boolean;
        };
        Insert: {
          id?: string;
          session_id: string;
          name: string;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
        };
        Update: {
          id?: string;
          session_id?: string;
          name?: string;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
        };
        Relationships: [{ foreignKeyName: "terms_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "academic_sessions"; referencedColumns: ["id"] }];
      };
      classes: {
        Row: {
          id: string;
          name: string;
          level: string | null;
          section: string | null;
          class_teacher_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          level?: string | null;
          section?: string | null;
          class_teacher_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          level?: string | null;
          section?: string | null;
          class_teacher_id?: string | null;
          created_at?: string;
        };
        Relationships: [{ foreignKeyName: "classes_class_teacher_id_fkey"; columns: ["class_teacher_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      subjects: {
        Row: {
          id: string;
          name: string;
          code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      class_subjects: {
        Row: {
          id: string;
          class_id: string;
          subject_id: string;
          teacher_id: string | null;
        };
        Insert: {
          id?: string;
          class_id: string;
          subject_id: string;
          teacher_id?: string | null;
        };
        Update: {
          id?: string;
          class_id?: string;
          subject_id?: string;
          teacher_id?: string | null;
        };
        Relationships: [
          { foreignKeyName: "class_subjects_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "class_subjects_subject_id_fkey"; columns: ["subject_id"]; isOneToOne: false; referencedRelation: "subjects"; referencedColumns: ["id"] },
          { foreignKeyName: "class_subjects_teacher_id_fkey"; columns: ["teacher_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      students: {
        Row: {
          id: string;
          admission_number: string;
          full_name: string;
          gender: string | null;
          date_of_birth: string | null;
          guardian_name: string | null;
          guardian_phone: string | null;
          photo_url: string | null;
          class_id: string | null;
          status: string;
          enrolled_on: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          admission_number: string;
          full_name: string;
          gender?: string | null;
          date_of_birth?: string | null;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          photo_url?: string | null;
          class_id?: string | null;
          status?: string;
          enrolled_on?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          admission_number?: string;
          full_name?: string;
          gender?: string | null;
          date_of_birth?: string | null;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          photo_url?: string | null;
          class_id?: string | null;
          status?: string;
          enrolled_on?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [{ foreignKeyName: "students_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] }];
      };
      grade_scale: {
        Row: {
          id: string;
          min_score: number;
          max_score: number;
          grade: string;
          remark: string;
        };
        Insert: {
          id?: string;
          min_score: number;
          max_score: number;
          grade: string;
          remark: string;
        };
        Update: {
          id?: string;
          min_score?: number;
          max_score?: number;
          grade?: string;
          remark?: string;
        };
        Relationships: [];
      };
      assessment_components: {
        Row: {
          id: string;
          name: string;
          max_score: number;
          position: number;
        };
        Insert: {
          id?: string;
          name: string;
          max_score?: number;
          position?: number;
        };
        Update: {
          id?: string;
          name?: string;
          max_score?: number;
          position?: number;
        };
        Relationships: [];
      };
      attendance: {
        Row: {
          id: string;
          student_id: string;
          class_id: string | null;
          attendance_date: string;
          status: "present" | "absent" | "late";
          state: "draft" | "submitted";
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          class_id?: string | null;
          attendance_date: string;
          status: "present" | "absent" | "late";
          state?: "draft" | "submitted";
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          class_id?: string | null;
          attendance_date?: string;
          status?: "present" | "absent" | "late";
          state?: "draft" | "submitted";
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "attendance_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "attendance_recorded_by_fkey"; columns: ["recorded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "attendance_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
        ];
      };
      assessment_scores: {
        Row: {
          id: string;
          student_id: string;
          subject_id: string;
          component_id: string;
          term_id: string;
          score: number;
          state: "draft" | "submitted";
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          subject_id: string;
          component_id: string;
          term_id: string;
          score?: number;
          state?: "draft" | "submitted";
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          subject_id?: string;
          component_id?: string;
          term_id?: string;
          score?: number;
          state?: "draft" | "submitted";
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "assessment_scores_component_id_fkey"; columns: ["component_id"]; isOneToOne: false; referencedRelation: "assessment_components"; referencedColumns: ["id"] },
          { foreignKeyName: "assessment_scores_recorded_by_fkey"; columns: ["recorded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "assessment_scores_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "assessment_scores_subject_id_fkey"; columns: ["subject_id"]; isOneToOne: false; referencedRelation: "subjects"; referencedColumns: ["id"] },
          { foreignKeyName: "assessment_scores_term_id_fkey"; columns: ["term_id"]; isOneToOne: false; referencedRelation: "terms"; referencedColumns: ["id"] },
        ];
      };
      behaviour_assessments: {
        Row: {
          id: string;
          student_id: string;
          term_id: string;
          domain: string;
          trait: string;
          rating: number;
          recorded_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          term_id: string;
          domain: string;
          trait: string;
          rating?: number;
          recorded_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          term_id?: string;
          domain?: string;
          trait?: string;
          rating?: number;
          recorded_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "behaviour_assessments_recorded_by_fkey"; columns: ["recorded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "behaviour_assessments_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "behaviour_assessments_term_id_fkey"; columns: ["term_id"]; isOneToOne: false; referencedRelation: "terms"; referencedColumns: ["id"] },
        ];
      };
      report_cards: {
        Row: {
          id: string;
          student_id: string;
          term_id: string;
          average: number | null;
          position: number | null;
          teacher_comment: string | null;
          head_comment: string | null;
          published: boolean;
          published_at: string | null;
          published_by: string | null;
          snapshot: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          term_id: string;
          average?: number | null;
          position?: number | null;
          teacher_comment?: string | null;
          head_comment?: string | null;
          published?: boolean;
          published_at?: string | null;
          published_by?: string | null;
          snapshot?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          term_id?: string;
          average?: number | null;
          position?: number | null;
          teacher_comment?: string | null;
          head_comment?: string | null;
          published?: boolean;
          published_at?: string | null;
          published_by?: string | null;
          snapshot?: Json | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "report_cards_published_by_fkey"; columns: ["published_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "report_cards_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "report_cards_term_id_fkey"; columns: ["term_id"]; isOneToOne: false; referencedRelation: "terms"; referencedColumns: ["id"] },
        ];
      };
      correction_requests: {
        Row: {
          id: string;
          requested_by: string | null;
          student_id: string | null;
          subject_id: string | null;
          term_id: string | null;
          field_label: string;
          original_value: string | null;
          requested_value: string | null;
          reason: string;
          status: "pending" | "approved" | "rejected";
          decided_by: string | null;
          decision_reason: string | null;
          decided_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          requested_by?: string | null;
          student_id?: string | null;
          subject_id?: string | null;
          term_id?: string | null;
          field_label: string;
          original_value?: string | null;
          requested_value?: string | null;
          reason: string;
          status?: "pending" | "approved" | "rejected";
          decided_by?: string | null;
          decision_reason?: string | null;
          decided_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          requested_by?: string | null;
          student_id?: string | null;
          subject_id?: string | null;
          term_id?: string | null;
          field_label?: string;
          original_value?: string | null;
          requested_value?: string | null;
          reason?: string;
          status?: "pending" | "approved" | "rejected";
          decided_by?: string | null;
          decision_reason?: string | null;
          decided_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "correction_requests_decided_by_fkey"; columns: ["decided_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "correction_requests_requested_by_fkey"; columns: ["requested_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "correction_requests_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "correction_requests_subject_id_fkey"; columns: ["subject_id"]; isOneToOne: false; referencedRelation: "subjects"; referencedColumns: ["id"] },
          { foreignKeyName: "correction_requests_term_id_fkey"; columns: ["term_id"]; isOneToOne: false; referencedRelation: "terms"; referencedColumns: ["id"] },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target: string | null;
          details: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          target?: string | null;
          details?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          target?: string | null;
          details?: string | null;
          created_at?: string;
        };
        Relationships: [{ foreignKeyName: "audit_logs_actor_id_fkey"; columns: ["actor_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      perf_metrics: {
        Row: {
          id: number;
          kind: "http" | "db";
          method: string | null;
          path: string | null;
          status_code: number | null;
          model: string | null;
          action: string | null;
          duration_ms: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          kind: "http" | "db";
          method?: string | null;
          path?: string | null;
          status_code?: number | null;
          model?: string | null;
          action?: string | null;
          duration_ms: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          kind?: "http" | "db";
          method?: string | null;
          path?: string | null;
          status_code?: number | null;
          model?: string | null;
          action?: string | null;
          duration_ms?: number;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      assign_default_role: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      assign_class_teacher: {
        Args: { p_teacher_id: string; p_class_id: string };
        Returns: unknown;
      };
      assign_teacher_subject: {
        Args: { p_teacher_id: string; p_class_id: string; p_subject_id: string };
        Returns: unknown;
      };
      has_role: {
        Args: { _user_id: string; _role: "admin" | "head_teacher" | "teacher" };
        Returns: boolean;
      };
      is_staff: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      is_manager: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      protect_published_report: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      prune_perf_metrics: {
        Args: Record<string, never>;
        Returns: void;
      };
      update_updated_at_column: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
    Enums: {
      app_role: "admin" | "head_teacher" | "teacher";
      attendance_status: "present" | "absent" | "late";
      record_state: "draft" | "submitted";
      request_status: "pending" | "approved" | "rejected";
    };
    CompositeTypes: {
      [_ in string]: never;
    };
  };
};
