export type Role = 'resident' | 'board' | 'admin';
export type Profile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  lot_id: string | null;
  role: Role;
  status: 'pending' | 'approved' | 'suspended';
  directory_opt_in: boolean;
  directory_show_email: boolean;
  directory_show_phone: boolean;
};

export const isMember = (p: Profile | null): p is Profile => p?.status === 'approved';
export const isStaff = (p: Profile | null): p is Profile => isMember(p) && (p.role === 'board' || p.role === 'admin');
export const isAdmin = (p: Profile | null): p is Profile => isMember(p) && p.role === 'admin';

/** Only allow same-site relative redirect targets (prevents open redirects via ?next=). */
export function safeNext(value: string | null | undefined, fallback = '/members'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n]/.test(value)) {
    return fallback;
  }
  return value;
}
