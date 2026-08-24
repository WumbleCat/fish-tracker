/** Shapes the API returns. The backend is the authority; these mirror its
 * Pydantic schemas and are never extended with client-invented fields. */

export type GameState = 'draft' | 'open' | 'running' | 'settling' | 'closed' | 'abandoned';
export type EntryType = 'buy_in' | 'rebuy' | 'cash_out';
export type EntryState = 'pending' | 'verified' | 'rejected' | 'void';
export type MemberRole = 'player' | 'host';

export interface Entry {
  id: string;
  game_id: string;
  user_id: string;
  entry_type: EntryType;
  amount_minor: number;
  state: EntryState;
  created_at: string;
  logged_by: string;
  verified_by: string | null;
  verified_at: string | null;
  rejection_note: string | null;
  void_reason: string | null;
  amends_entry_id: string | null;
  version: number;
  /** Client-chosen UUID sent with the insert; the optimistic row and the
   * server row share it, so lists key on it and never flicker. */
  client_key: string | null;
}

export interface Member {
  user_id: string;
  display_name: string;
  is_guest: boolean;
  role: MemberRole;
  joined_at: string;
  departed_at: string | null;
  departed_unsettled: boolean;
}

export interface PlayerNet {
  user_id: string;
  settleable_minor: number;
  pending_delta_minor: number;
  pending_count: number;
}

export interface GameTotals {
  verified_buy_ins_minor: number;
  verified_cash_outs_minor: number;
  chips_on_table_minor: number;
  pending_count: number;
}

export interface Game {
  id: string;
  name: string;
  join_code: string;
  state: GameState;
  host_id: string;
  currency: string;
  currency_exponent: number;
  stake_minor: number | null;
  created_at: string;
  closed_at: string | null;
  version: number;
  members: Member[];
  entries: Entry[];
  nets: PlayerNet[];
  totals: GameTotals;
}

export interface GameSummary {
  id: string;
  name: string;
  state: GameState;
  currency: string;
  currency_exponent: number;
  created_at: string;
  closed_at: string | null;
  role: MemberRole;
}

export interface Payment {
  from_user: string;
  to_user: string;
  amount_minor: number;
}

export interface Settlement {
  final: boolean;
  computed_at: string | null;
  payments: Payment[];
  discrepancy_minor: number;
  acknowledged_by: string | null;
  needs_acknowledgement: boolean;
  pending_count: number;
  nets: Record<string, number>;
}

export interface User {
  id: string;
  display_name: string;
  is_guest: boolean;
  default_currency: string;
  created_at: string;
}

export interface PayoutDetailsMasked {
  user_id: string;
  display_name: string;
  account_name: string | null;
  sort_code: string | null;
  account_number_masked: string | null;
  payment_reference: string | null;
  revolut_link: string | null;
}

export interface HistoryEntry {
  id: string;
  entry_type: EntryType;
  amount_minor: number;
  state: EntryState;
  created_at: string;
}

/** One table this player sat at. Money counts verified entries only;
 * every entry is listed regardless of state. */
export interface GameHistory {
  game_id: string;
  name: string;
  state: GameState;
  created_at: string;
  closed_at: string | null;
  currency: string;
  currency_exponent: number;
  role: MemberRole;
  hosted: boolean;
  buy_ins_minor: number;
  cash_outs_minor: number;
  net_minor: number;
  entries: HistoryEntry[];
}

export interface CurrencyHistory {
  currency: string;
  currency_exponent: number;
  games_played: number;
  total_buy_ins_minor: number;
  total_cash_outs_minor: number;
  net_minor: number;
  adjustments_minor: number;
}

export interface ApiError {
  error: string;
  detail: Record<string, unknown>;
}
