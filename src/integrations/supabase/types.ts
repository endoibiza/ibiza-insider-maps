export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      fourvenues_event_snapshots: {
        Row: {
          fetched_at: string
          fourvenues_event_id: string
          id: string
          organization_id: string | null
          payload: Json
          payload_hash: string | null
        }
        Insert: {
          fetched_at?: string
          fourvenues_event_id: string
          id?: string
          organization_id?: string | null
          payload: Json
          payload_hash?: string | null
        }
        Update: {
          fetched_at?: string
          fourvenues_event_id?: string
          id?: string
          organization_id?: string | null
          payload?: Json
          payload_hash?: string | null
        }
        Relationships: []
      }
      fourvenues_organizations: {
        Row: {
          created_at: string
          currency: string | null
          fourvenues_id: string
          id: string
          last_synced_at: string
          locale: string | null
          name: string
          organization_type: string
          raw_metadata: Json
          slug: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          fourvenues_id: string
          id?: string
          last_synced_at?: string
          locale?: string | null
          name: string
          organization_type?: string
          raw_metadata?: Json
          slug?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          fourvenues_id?: string
          id?: string
          last_synced_at?: string
          locale?: string | null
          name?: string
          organization_type?: string
          raw_metadata?: Json
          slug?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ibiza_events: {
        Row: {
          checkout_url: string | null
          created_at: string
          date: string | null
          display_date: string | null
          end_date: string | null
          end_time: string | null
          event_groups: Json
          event_name: string
          event_series: string | null
          event_url: string | null
          featured_on_party_calendar: boolean
          fourvenues_currency: string | null
          fourvenues_event_id: string | null
          fourvenues_organization_id: string | null
          fourvenues_slug: string | null
          id: string
          iframe_script_url: string | null
          iframe_tag_url: string | null
          image_url: string | null
          last_synced_at: string | null
          lineup_details: string | null
          list_rates: Json
          location_address: string | null
          location_city: string | null
          location_country: string | null
          location_latitude: number | null
          location_longitude: number | null
          location_name: string | null
          mikes_pick: boolean
          notion_page_id: string
          notes: string | null
          preregister: Json | null
          raw_fourvenues_payload: Json | null
          residents_pass: string | null
          slug: string | null
          source: string | null
          source_missing_since: string | null
          start_time: string | null
          status: string | null
          ticket_rates: Json
          type: string | null
          venue: string | null
        }
        Insert: {
          checkout_url?: string | null
          created_at?: string
          date?: string | null
          display_date?: string | null
          end_date?: string | null
          end_time?: string | null
          event_groups?: Json
          event_name: string
          event_series?: string | null
          event_url?: string | null
          featured_on_party_calendar?: boolean
          fourvenues_currency?: string | null
          fourvenues_event_id?: string | null
          fourvenues_organization_id?: string | null
          fourvenues_slug?: string | null
          id?: string
          iframe_script_url?: string | null
          iframe_tag_url?: string | null
          image_url?: string | null
          last_synced_at?: string | null
          lineup_details?: string | null
          list_rates?: Json
          location_address?: string | null
          location_city?: string | null
          location_country?: string | null
          location_latitude?: number | null
          location_longitude?: number | null
          location_name?: string | null
          mikes_pick?: boolean
          notion_page_id: string
          notes?: string | null
          preregister?: Json | null
          raw_fourvenues_payload?: Json | null
          residents_pass?: string | null
          slug?: string | null
          source?: string | null
          source_missing_since?: string | null
          start_time?: string | null
          status?: string | null
          ticket_rates?: Json
          type?: string | null
          venue?: string | null
        }
        Update: {
          checkout_url?: string | null
          created_at?: string
          date?: string | null
          display_date?: string | null
          end_date?: string | null
          end_time?: string | null
          event_groups?: Json
          event_name?: string
          event_series?: string | null
          event_url?: string | null
          featured_on_party_calendar?: boolean
          fourvenues_currency?: string | null
          fourvenues_event_id?: string | null
          fourvenues_organization_id?: string | null
          fourvenues_slug?: string | null
          id?: string
          iframe_script_url?: string | null
          iframe_tag_url?: string | null
          image_url?: string | null
          last_synced_at?: string | null
          lineup_details?: string | null
          list_rates?: Json
          location_address?: string | null
          location_city?: string | null
          location_country?: string | null
          location_latitude?: number | null
          location_longitude?: number | null
          location_name?: string | null
          mikes_pick?: boolean
          notion_page_id?: string
          notes?: string | null
          preregister?: Json | null
          raw_fourvenues_payload?: Json | null
          residents_pass?: string | null
          slug?: string | null
          source?: string | null
          source_missing_since?: string | null
          start_time?: string | null
          status?: string | null
          ticket_rates?: Json
          type?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          payment_id: string
          payment_method: string
          payment_status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          payment_id: string
          payment_method?: string
          payment_status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          payment_id?: string
          payment_method?: string
          payment_status?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          has_premium_access: boolean
          id: string
          payment_id: string | null
          promo_code_used: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          has_premium_access?: boolean
          id?: string
          payment_id?: string | null
          promo_code_used?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          has_premium_access?: boolean
          id?: string
          payment_id?: string | null
          promo_code_used?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          max_uses: number | null
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          uses_count?: number
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          metadata: Json
          records_seen: number
          records_soft_missing: number
          records_upserted: number
          source: string
          started_at: string
          status: string
          sync_name: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          records_seen?: number
          records_soft_missing?: number
          records_upserted?: number
          source: string
          started_at?: string
          status: string
          sync_name: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          records_seen?: number
          records_soft_missing?: number
          records_upserted?: number
          source?: string
          started_at?: string
          status?: string
          sync_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_latest_sync: {
        Args: { target_sync_name?: string }
        Returns: {
          completed_at: string | null
          error_message: string | null
          id: string
          metadata: Json
          records_seen: number
          records_soft_missing: number
          records_upserted: number
          source: string
          started_at: string
          status: string
          sync_name: string
        }[]
      }
      increment_promo_use: {
        Args: { promo_code: string }
        Returns: boolean
      }
      mark_missing_fourvenues_events: {
        Args: {
          seen_external_ids: string[]
          target_organization_id?: string | null
          window_end: string
          window_start: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
