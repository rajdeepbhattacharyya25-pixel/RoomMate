export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      app_versions: {
        Row: {
          id: string;
          app_name: string;
          version: string;
          channel: 'staging' | 'production';
          bundle_url: string;
          checksum: string;
          changelog: string | null;
          min_native_version: string;
          is_active: boolean;
          build_time: string | null;
          created_at: string;
          published_at: string | null;
        };
        Insert: {
          id?: string;
          app_name?: string;
          version: string;
          channel: 'staging' | 'production';
          bundle_url: string;
          checksum: string;
          changelog?: string | null;
          min_native_version?: string;
          is_active?: boolean;
          build_time?: string | null;
          created_at?: string;
          published_at?: string | null;
        };
        Update: {
          id?: string;
          app_name?: string;
          version?: string;
          channel?: 'staging' | 'production';
          bundle_url?: string;
          checksum?: string;
          changelog?: string | null;
          min_native_version?: string;
          is_active?: boolean;
          build_time?: string | null;
          created_at?: string;
          published_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          phone: string | null;
          name: string;
          avatar_url: string | null;
          upi_qr_url: string | null;
          upi_id: string | null;
          fcm_token: string | null;
          role: 'SUPER_ADMIN' | 'STUDENT';
          is_suspended: boolean;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          phone?: string | null;
          name: string;
          avatar_url?: string | null;
          upi_qr_url?: string | null;
          upi_id?: string | null;
          fcm_token?: string | null;
          role?: 'SUPER_ADMIN' | 'STUDENT';
          is_suspended?: boolean;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          phone?: string | null;
          name?: string;
          avatar_url?: string | null;
          upi_qr_url?: string | null;
          upi_id?: string | null;
          fcm_token?: string | null;
          role?: 'SUPER_ADMIN' | 'STUDENT';
          is_suspended?: boolean;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_code: 'FREE' | 'PRO' | 'CAMPUS_MAX';
          plan_name: string;
          price_inr: number;
          status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELLED';
          razorpay_customer_id: string | null;
          razorpay_subscription_id: string | null;
          current_period_start: string;
          current_period_end: string;
          grace_period_until: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_code?: 'FREE' | 'PRO' | 'CAMPUS_MAX';
          plan_name?: string;
          price_inr?: number;
          status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELLED';
          razorpay_customer_id?: string | null;
          razorpay_subscription_id?: string | null;
          current_period_start?: string;
          current_period_end?: string;
          grace_period_until?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_code?: 'FREE' | 'PRO' | 'CAMPUS_MAX';
          plan_name?: string;
          price_inr?: number;
          status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELLED';
          razorpay_customer_id?: string | null;
          razorpay_subscription_id?: string | null;
          current_period_start?: string;
          current_period_end?: string;
          grace_period_until?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscription_events: {
        Row: {
          id: string;
          user_id: string;
          razorpay_event_id: string;
          event_type: string;
          payload: Json;
          processed_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          razorpay_event_id: string;
          event_type: string;
          payload?: Json;
          processed_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          razorpay_event_id?: string;
          event_type?: string;
          payload?: Json;
          processed_at?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_by: string;
          admin_user_id: string | null;
          join_policy: 'APPROVAL_REQUIRED' | 'INSTANT';
          invite_policy: 'ALL_MEMBERS' | 'ADMIN_ONLY';
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_by: string;
          admin_user_id?: string | null;
          join_policy?: 'APPROVAL_REQUIRED' | 'INSTANT';
          invite_policy?: 'ALL_MEMBERS' | 'ADMIN_ONLY';
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_by?: string;
          admin_user_id?: string | null;
          join_policy?: 'APPROVAL_REQUIRED' | 'INSTANT';
          invite_policy?: 'ALL_MEMBERS' | 'ADMIN_ONLY';
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      room_members: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          role: 'ROOM_ADMIN' | 'MEMBER';
          status: 'ACTIVE' | 'LEFT' | 'REMOVED';
          joined_at: string;
          left_at: string | null;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          role?: 'ROOM_ADMIN' | 'MEMBER';
          status?: 'ACTIVE' | 'LEFT' | 'REMOVED';
          joined_at?: string;
          left_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          role?: 'ROOM_ADMIN' | 'MEMBER';
          status?: 'ACTIVE' | 'LEFT' | 'REMOVED';
          joined_at?: string;
          left_at?: string | null;
        };
        Relationships: [];
      };
      room_invitations: {
        Row: {
          id: string;
          room_id: string;
          invite_code: string;
          token: string;
          created_by: string;
          expires_at: string | null;
          is_revoked: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          invite_code: string;
          token?: string;
          created_by: string;
          expires_at?: string | null;
          is_revoked?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          invite_code?: string;
          token?: string;
          created_by?: string;
          expires_at?: string | null;
          is_revoked?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      room_join_requests: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          status: 'PENDING' | 'APPROVED' | 'DECLINED';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          status?: 'PENDING' | 'APPROVED' | 'DECLINED';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          status?: 'PENDING' | 'APPROVED' | 'DECLINED';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      personal_expenses: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          amount: number;
          category: 'Food' | 'Shopping' | 'Travel' | 'Entertainment' | 'Academics' | 'Health' | 'Other';
          notes: string | null;
          expense_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          amount: number;
          category: 'Food' | 'Shopping' | 'Travel' | 'Entertainment' | 'Academics' | 'Health' | 'Other';
          notes?: string | null;
          expense_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          amount?: number;
          category?: 'Food' | 'Shopping' | 'Travel' | 'Entertainment' | 'Academics' | 'Health' | 'Other';
          notes?: string | null;
          expense_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shared_expenses: {
        Row: {
          id: string;
          room_id: string;
          created_by: string;
          paid_by: string;
          title: string;
          total_amount: number;
          category: 'Rent' | 'Electricity' | 'Groceries' | 'Water' | 'Wi-Fi' | 'Gas' | 'Cleaning' | 'Food' | 'Other';
          split_method: 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES';
          notes: string | null;
          expense_date: string;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          created_by: string;
          paid_by: string;
          title: string;
          total_amount: number;
          category: 'Rent' | 'Electricity' | 'Groceries' | 'Water' | 'Wi-Fi' | 'Gas' | 'Cleaning' | 'Food' | 'Other';
          split_method: 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES';
          notes?: string | null;
          expense_date?: string;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          created_by?: string;
          paid_by?: string;
          title?: string;
          total_amount?: number;
          category?: 'Rent' | 'Electricity' | 'Groceries' | 'Water' | 'Wi-Fi' | 'Gas' | 'Cleaning' | 'Food' | 'Other';
          split_method?: 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES';
          notes?: string | null;
          expense_date?: string;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      expense_splits: {
        Row: {
          id: string;
          shared_expense_id: string;
          user_id: string;
          share_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          shared_expense_id: string;
          user_id: string;
          share_amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          shared_expense_id?: string;
          user_id?: string;
          share_amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      settlement_payments: {
        Row: {
          id: string;
          room_id: string;
          payer_id: string;
          payee_id: string;
          amount: number;
          payment_method: 'UPI' | 'CASH' | 'BANK_TRANSFER' | 'OTHER';
          transaction_ref: string | null;
          notes: string | null;
          payment_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          payer_id: string;
          payee_id: string;
          amount: number;
          payment_method: 'UPI' | 'CASH' | 'BANK_TRANSFER' | 'OTHER';
          transaction_ref?: string | null;
          notes?: string | null;
          payment_date?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          payer_id?: string;
          payee_id?: string;
          amount?: number;
          payment_method?: 'UPI' | 'CASH' | 'BANK_TRANSFER' | 'OTHER';
          transaction_ref?: string | null;
          notes?: string | null;
          payment_date?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          resource_type?: string;
          resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      in_app_notifications: {
        Row: {
          id: string;
          user_id: string;
          room_id: string | null;
          type: string;
          title: string;
          message: string;
          priority: 'HIGH' | 'MEDIUM' | 'LOW';
          is_read: boolean;
          read_at: string | null;
          created_at: string;
          action_type: string | null;
          action_target: string | null;
          metadata: Json;
          event_id: string | null;
          is_deleted: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          room_id?: string | null;
          type: string;
          title: string;
          message: string;
          priority: 'HIGH' | 'MEDIUM' | 'LOW';
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
          action_type?: string | null;
          action_target?: string | null;
          metadata?: Json;
          event_id?: string | null;
          is_deleted?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          room_id?: string | null;
          type?: string;
          title?: string;
          message?: string;
          priority?: 'HIGH' | 'MEDIUM' | 'LOW';
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
          action_type?: string | null;
          action_target?: string | null;
          metadata?: Json;
          event_id?: string | null;
          is_deleted?: boolean;
        };
        Relationships: [];
      };
      bug_reports: {
        Row: {
          id: string;
          user_id: string;
          user_name: string;
          user_email: string;
          user_role: string;
          category: string;
          severity: string;
          status: string;
          description: string;
          screenshot_url: string | null;
          diagnostics: Json;
          admin_notes: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          user_name: string;
          user_email: string;
          user_role?: string;
          category: string;
          severity: string;
          status?: string;
          description: string;
          screenshot_url?: string | null;
          diagnostics?: Json;
          admin_notes?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          user_name?: string;
          user_email?: string;
          user_role?: string;
          category?: string;
          severity?: string;
          status?: string;
          description?: string;
          screenshot_url?: string | null;
          diagnostics?: Json;
          admin_notes?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_devices: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          fcm_token: string;
          platform: string;
          is_active: boolean;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id: string;
          fcm_token: string;
          platform?: string;
          is_active?: boolean;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          device_id?: string;
          fcm_token?: string;
          platform?: string;
          is_active?: boolean;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_room_member: {
        Args: {
          check_room_id: string;
          check_user_id: string;
        };
        Returns: boolean;
      };
      is_room_admin: {
        Args: {
          check_room_id: string;
          check_user_id: string;
        };
        Returns: boolean;
      };
      is_super_admin: {
        Args: {
          check_user_id: string;
        };
        Returns: boolean;
      };
      get_room_balances: {
        Args: {
          p_room_id: string;
        };
        Returns: {
          user_id: string;
          name: string;
          email: string;
          total_paid: number;
          total_share: number;
          settlements_paid: number;
          settlements_received: number;
          net_balance: number;
        }[];
      };
      leave_room: {
        Args: {
          p_room_id: string;
        };
        Returns: {
          success: boolean;
          new_admin_id: string | null;
          is_archived: boolean;
        };
      };
      remove_room_member: {
        Args: {
          p_room_id: string;
          p_target_user_id: string;
        };
        Returns: {
          success: boolean;
        };
      };
      transfer_room_ownership: {
        Args: {
          p_room_id: string;
          p_new_admin_id: string;
        };
        Returns: {
          success: boolean;
          old_admin_id: string;
          new_admin_id: string;
        };
      };
      regenerate_room_invite: {
        Args: {
          p_room_id: string;
          p_expiration_hours?: number;
        };
        Returns: {
          id: string;
          room_id: string;
          invite_code: string;
          token: string;
          created_by: string;
          expires_at: string | null;
          is_revoked: boolean;
          created_at: string;
        };
      };
      delete_user_account: {
        Args: Record<string, never>;
        Returns: {
          success: boolean;
          deleted_user_id: string;
          deleted_rooms?: number;
          reassigned_rooms?: number;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
