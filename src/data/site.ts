export const site = {
  name: 'Village East',
  fullName: 'Village East Property Owners Association',
  shortName: 'VEPOA',
  tagline: "One of Smith Mountain Lake's finest communities",
  locality: 'Smith Mountain Lake, Virginia',
  mailingAddress: ['PO Box 452', 'Moneta, VA 24121'],
  clubhouseAddress: ['402 Indian Ridge Drive', 'Moneta, VA 24121'],
  byLake: 'Roanoke River channel, marker R26 (Bedford County side)',
  byLand: 'Off Hickory Cove Road, Moneta, VA 24121',
  /** Set to a file in /public/photos (see scripts/fetch-legacy-photos.sh) to replace the illustrated hero. */
  heroPhoto: '/photos/hero.jpg' as string | null,
  demoNotice: true,
};

export const publicNav = [
  { href: '/', label: 'Home' },
  { href: '/amenities', label: 'Amenities' },
  { href: '/map', label: 'Community map' },
  { href: '/meetings', label: 'Meetings & events' },
  { href: '/documents', label: 'Documents' },
  { href: '/forms', label: 'Forms' },
  { href: '/realtors', label: 'Realtors' },
  { href: '/contact', label: 'Contact' },
];

export const memberNav = [
  { href: '/members', label: 'Overview', icon: 'grid' },
  { href: '/members/financials', label: 'Financials', icon: 'chart' },
  { href: '/members/minutes', label: 'Minutes & agendas', icon: 'file' },
  { href: '/members/newsletters', label: 'Newsletters', icon: 'news' },
  { href: '/members/board', label: 'Board & committees', icon: 'users' },
  { href: '/members/directory', label: 'Neighbor directory', icon: 'book' },
  { href: '/members/surveys', label: 'Surveys', icon: 'check' },
  { href: '/members/votes', label: 'Voting', icon: 'ballot' },
  { href: '/members/requests', label: 'My requests', icon: 'inbox' },
  { href: '/members/profile', label: 'My profile', icon: 'user' },
] as const;

export const adminNav = [
  { href: '/admin', label: 'Overview', icon: 'grid', adminOnly: false },
  { href: '/admin/requests', label: 'Requests', icon: 'inbox', adminOnly: false },
  { href: '/admin/dues', label: 'Dues', icon: 'dollar', adminOnly: false },
  { href: '/admin/surveys', label: 'Surveys', icon: 'check', adminOnly: false },
  { href: '/admin/votes', label: 'Ballots', icon: 'ballot', adminOnly: false },
  { href: '/admin/content', label: 'News & events', icon: 'news', adminOnly: false },
  { href: '/admin/messages', label: 'Messages', icon: 'mail', adminOnly: false },
  { href: '/admin/members', label: 'Members', icon: 'users', adminOnly: true },
  { href: '/admin/documents', label: 'Documents', icon: 'file', adminOnly: true },
] as const;
