/**
 * Village East financial history, transcribed from the reports in the document library
 * (content/documents/financial). MEMBERS-ONLY data: import this module only from server-rendered
 * pages under /members; never from a client <script>, which would publish it in a public bundle.
 *
 * To add a year: append an entry to YEARS (and RESERVE if the reserve analysis changed).
 * Amounts are whole dollars. `capital: true` marks one-off capital projects that the source report
 * booked inside an operating category, so charts can separate day-to-day running costs from projects.
 */
export type Line = { category: string; line: string; amount: number; capital?: boolean };
export type CapitalProject = { project: string; budget: number | null; actual: number };
export type FinanceYear = {
  year: number;
  source: string;
  basis: 'QuickBooks profit & loss' | 'Budget-to-actual report';
  note?: string;
  income: Line[];
  expenses: Line[];
  /** Operating budget by category, where the board published one. */
  budget?: { income: number; expenses: Record<string, number> };
  reserveTransfer: number | null;
  capital: CapitalProject[];
  dues?: { houses: [count: number, rate: number]; mowLots: [number, number]; lots: [number, number] };
};

export const EXPENSE_CATEGORIES = ['Administration', 'Clubhouse', 'Pool', 'Grounds', 'Roads'] as const;
export const INCOME_CATEGORIES = ['Dues', 'Fees', 'Interest', 'Other income'] as const;

const A = 'Administration', C = 'Clubhouse', P = 'Pool', G = 'Grounds', R = 'Roads';
const D = 'Dues', F = 'Fees', I = 'Interest', O = 'Other income';
const l = (category: string, line: string, amount: number, capital = false): Line => ({ category, line, amount, ...(capital ? { capital } : {}) });

export const YEARS: FinanceYear[] = [
  {
    year: 2019,
    source: '2019-2021 Annual Reports',
    basis: 'QuickBooks profit & loss',
    income: [l(D, 'Annual dues', 95180), l(D, 'Late fees', 3928), l(F, 'Real estate packets', 800), l(I, 'Interest', 103)],
    expenses: [
      l(A, 'General administration', 36), l(A, 'Website', 122), l(A, 'Telephone', 618), l(A, 'Utilities', 4040),
      l(A, 'Postage & shipping', 291), l(A, 'Office supplies', 255), l(A, 'Licenses & fees', 175), l(A, 'Bank charges', 49),
      l(A, 'Insurance', 3437), l(A, 'Legal', 736), l(A, 'Taxes', 5), l(A, 'Member events & annual meeting', 534),
      l(C, 'Repair & maintenance', 4405), l(C, 'Supplies', 8),
      l(P, 'Open & close', 1375), l(P, 'Repair', 585), l(P, 'Supplies & chemicals', 3723), l(P, 'Upkeep fee', 814), l(P, 'Caretaker & insurance', 9182),
      l(G, 'Landscape repair & maintenance', 28626), l(G, 'Dock, fence & boat storage', 46),
      l(G, 'Multi-purpose court (capital project)', 21424, true),
    ],
    reserveTransfer: 20000,
    capital: [{ project: 'Multi-purpose court', budget: 22000, actual: 21404 }],
  },
  {
    year: 2020,
    source: '2019-2021 Annual Reports',
    basis: 'Budget-to-actual report',
    income: [l(D, 'Annual dues', 88006), l(F, 'Real estate packets & other', 1500), l(F, 'Village North initiation fee', 1500), l(F, 'Village North user fee', 229)],
    expenses: [
      l(A, 'General administration', 13), l(A, 'Website', 122), l(A, 'Telephone', 623), l(A, 'Utilities', 3024),
      l(A, 'Postage & shipping', 732), l(A, 'Office supplies', 460), l(A, 'Licenses & fees', 35), l(A, 'Bank charges', 49),
      l(A, 'Insurance', 3230), l(A, 'Legal', 217), l(A, 'Taxes', 67), l(A, 'Member events & annual meeting', 163),
      l(C, 'Repair & maintenance', 2209), l(C, 'Supplies', 13),
      l(P, 'Open & close', 1400), l(P, 'Repair', 5687), l(P, 'Supplies & chemicals', 3651), l(P, 'Upkeep fee', 534), l(P, 'Caretaker & insurance', 8970),
      l(G, 'Landscape repair & maintenance', 20146), l(G, 'Dock, fence & boat storage', 103), l(G, 'Other grounds', 29),
      l(R, 'Resurfacing, patching & repair', 4120),
    ],
    budget: { income: 89000, expenses: { [A]: 11250, [C]: 1600, [P]: 17100, [G]: 23200, [R]: 6700 } },
    reserveTransfer: 20000,
    capital: [
      { project: 'Clubhouse & pumphouse roofing and gutters', budget: 9204, actual: 9850 },
      { project: 'Clubhouse renovation', budget: 6950, actual: 7230 },
      { project: 'Pool decking', budget: 17500, actual: 19890 },
    ],
    dues: { houses: [97, 550], mowLots: [28, 500], lots: [52, 400] },
  },
  {
    year: 2021,
    source: '2019-2021 Annual Reports',
    basis: 'Budget-to-actual report',
    income: [l(D, 'Annual dues', 88350), l(F, 'Real estate packets & other', 1150), l(F, 'Village North user fee', 550)],
    expenses: [
      l(A, 'General administration', 9), l(A, 'Website', 122), l(A, 'Telephone', 704), l(A, 'Utilities', 3492),
      l(A, 'Postage & shipping', 486), l(A, 'Office supplies', 96), l(A, 'Licenses & fees', 105), l(A, 'Bank charges', 49),
      l(A, 'Insurance', 3306), l(A, 'Legal', 370),
      l(C, 'Furniture', 1861), l(C, 'Repair & maintenance', 1614), l(C, 'Supplies', 109),
      l(P, 'Open & close', 703), l(P, 'Repair', 1138), l(P, 'Supplies & chemicals', 2277), l(P, 'Caretaker & insurance', 8974),
      l(G, 'Landscape repair & maintenance', 23199), l(G, 'Dock, fence & boat storage', 1297),
      l(R, 'Snow removal', 360),
    ],
    budget: { income: 90000, expenses: { [A]: 10200, [C]: 3750, [P]: 15550, [G]: 26500, [R]: 5000 } },
    reserveTransfer: 20000,
    capital: [
      { project: 'Boat ramp & parking paving', budget: 25000, actual: 24997 },
      { project: 'Boat ramp access gate & electrical', budget: 15000, actual: 17694 },
    ],
    dues: { houses: [97, 550], mowLots: [27, 500], lots: [53, 400] },
  },
  {
    year: 2022,
    source: '2022 Year-End Financial Report',
    basis: 'Budget-to-actual report',
    note: 'Other fees include road impact fees that were transferred to the road escrow.',
    income: [
      l(D, 'Annual dues', 89250), l(D, 'Back dues collected', 1024),
      l(F, 'Packets, road impact fees, late fees & interest', 13916), l(F, 'Village North user fee', 550), l(F, 'Boat storage lot fees', 2680),
    ],
    expenses: [
      l(A, 'General administration', 950), l(A, 'Website', 665), l(A, 'Telephone', 638), l(A, 'Utilities', 3354),
      l(A, 'Postage & shipping', 549), l(A, 'Office supplies', 323), l(A, 'Licenses & fees', 105), l(A, 'Bank charges', 61),
      l(A, 'Insurance', 3316), l(A, 'Legal', 7327), l(A, 'Member events & annual meeting', 191),
      l(C, 'Furniture', 686), l(C, 'Repair & maintenance', 933), l(C, 'Supplies', 323),
      l(P, 'Open & close', 1225), l(P, 'Repair', 917), l(P, 'Supplies & chemicals', 2405), l(P, 'Caretaker & insurance', 9081),
      l(G, 'Landscape repair & maintenance', 25014), l(G, 'Dock, fence & boat storage', 2430),
      l(R, 'Snow removal', 1365),
    ],
    budget: { income: 93000, expenses: { [A]: 11400, [C]: 2500, [P]: 16600, [G]: 27500, [R]: 3000 } },
    reserveTransfer: 22680,
    capital: [
      { project: 'Extensive road repairs (postponed)', budget: 5000, actual: 0 },
      { project: 'Dock improvements (deposit)', budget: 5000, actual: 1000 },
    ],
    dues: { houses: [97, 550], mowLots: [27, 500], lots: [53, 400] },
  },
  {
    year: 2023,
    source: '2023 Year-End Report',
    basis: 'Budget-to-actual report',
    income: [
      l(D, 'Annual dues', 86250),
      l(F, 'Packets, road impact fees, late fees & interest', 6408), l(F, 'Village North initiation fee', 1500),
      l(F, 'Village North user fee', 596), l(F, 'Boat storage lot fees', 3090),
    ],
    expenses: [
      l(A, 'General administration', 842), l(A, 'Website', 38), l(A, 'Telephone', 671), l(A, 'Utilities', 2552),
      l(A, 'Postage & shipping', 662), l(A, 'Office supplies', 312), l(A, 'Licenses & fees', 105), l(A, 'Bank charges', 49),
      l(A, 'Insurance', 3639), l(A, 'Legal', 2817),
      l(C, 'Furniture', 1957), l(C, 'Repair & maintenance', 964), l(C, 'Supplies', 254),
      l(P, 'Open & close', 925), l(P, 'Repair', 4959), l(P, 'Supplies & chemicals', 714), l(P, 'Caretaker & insurance', 11686),
      l(G, 'Landscape repair & maintenance', 30861), l(G, 'Dock, fence & boat storage', 325), l(G, 'Other grounds', 3278),
    ],
    budget: { income: 94260, expenses: { [A]: 13600, [C]: 3500, [P]: 16600, [G]: 25800, [R]: 3000 } },
    reserveTransfer: 23090,
    capital: [
      { project: 'Woodley & Little Creek road repairs', budget: 7500, actual: 7500 },
      { project: 'Dock improvements', budget: 20000, actual: 625 },
    ],
    dues: { houses: [97, 550], mowLots: [27, 500], lots: [52, 400] },
  },
  {
    year: 2024,
    source: '2024 Profit & Loss Report',
    basis: 'QuickBooks profit & loss',
    note: 'The 2024 report books capital projects (Wagon Wheel paving, dock improvements, entrance repair) as operating expenses; they are shown separately here.',
    income: [
      l(D, 'Annual dues', 90050), l(D, 'Late fees', 54),
      l(F, 'Real estate packets', 700), l(F, 'Road impact fees', 4000), l(F, 'Other fees', 4838),
      l(I, 'Interest', 2720),
    ],
    expenses: [
      l(A, 'General administration', 1853), l(A, 'Website', 221), l(A, 'Telephone', 672), l(A, 'Utilities', 3399),
      l(A, 'Postage & shipping', 555), l(A, 'Office supplies', 601), l(A, 'Licenses & fees', 80), l(A, 'Bank charges', 49),
      l(A, 'Insurance', 3628), l(A, 'Legal', 2556), l(A, 'Taxes', 36), l(A, 'Bad debt', 451),
      l(C, 'Repair & maintenance', 1206), l(C, 'Supplies', 89),
      l(P, 'Open & close', 1310), l(P, 'Repair', 403), l(P, 'Supplies & chemicals', 3796), l(P, 'Caretaker & insurance', 12578), l(P, 'Other pool', 50),
      l(G, 'Landscape repair & maintenance', 23193), l(G, 'Other grounds', 4121),
      l(G, 'Dock improvements (capital project)', 12995, true),
      l(R, 'Repair', 143),
      l(R, 'Wagon Wheel paving (capital project)', 59000, true),
    ],
    budget: { income: 94400, expenses: { [A]: 13100, [C]: 2450, [P]: 16500, [G]: 26500, [R]: 3000 } },
    reserveTransfer: 23260,
    capital: [
      { project: 'Road paving (Wagon Wheel)', budget: 48000, actual: 59000 },
      { project: 'Dock improvements', budget: 20000, actual: 12686 },
      { project: 'Repair/repave entrance', budget: 5700, actual: 4057 },
      { project: 'Custom pool cover & sand filters', budget: 11000, actual: 0 },
    ],
    dues: { houses: [102, 550], mowLots: [26, 500], lots: [48, 400] },
  },
  {
    year: 2025,
    source: '2025 Profit & Loss Report',
    basis: 'QuickBooks profit & loss',
    income: [
      l(D, 'Annual dues', 89413), l(D, 'Late fees', 240),
      l(F, 'Real estate packets', 1300), l(F, 'Road impact fees', 2000), l(F, 'Other fees', 6290),
      l(I, 'Interest', 3011), l(O, 'Other income', 775),
    ],
    expenses: [
      l(A, 'General administration', 1536), l(A, 'Website', 41), l(A, 'Telephone', 669), l(A, 'Utilities', 3496),
      l(A, 'Postage & shipping', 290), l(A, 'Licenses & fees', 80), l(A, 'Bank charges', 55), l(A, 'Insurance', 3722),
      l(A, 'Legal', 802), l(A, 'Taxes', 934), l(A, 'Dues & subscriptions', 226), l(A, 'Professional fees', 4648),
      l(C, 'Repair & maintenance', 1595),
      l(P, 'Open & close', 2532), l(P, 'Repair', 6537), l(P, 'Supplies & chemicals', 1908), l(P, 'Upkeep fee', 4134), l(P, 'Caretaker & insurance', 10000),
      l(G, 'Landscape repair & maintenance', 30347), l(G, 'Other grounds', 455), l(G, 'Dock, fence & boat storage', -75),
      l(R, 'Snow removal', 955), l(R, 'Other roads', 210),
    ],
    reserveTransfer: null,
    capital: [],
  },
];

/** Reserve analysis approved 14 March 2024. `projected` years are the board's forward plan. */
export const RESERVE: { year: number; startBalance: number; projected: boolean; projects: { name: string; amount: number }[]; roadEscrow: number }[] = [
  { year: 2019, startBalance: 85200, projected: false, roadEscrow: 10000, projects: [{ name: 'Multi-purpose court', amount: 21404 }] },
  { year: 2020, startBalance: 97296, projected: false, roadEscrow: 10000, projects: [{ name: 'Clubhouse/pumphouse roofing & gutters', amount: 9850 }, { name: 'Clubhouse renovation', amount: 7230 }, { name: 'Pool decking', amount: 19890 }] },
  { year: 2021, startBalance: 100326, projected: false, roadEscrow: 10000, projects: [{ name: 'Boat ramp & parking paving', amount: 24997 }, { name: 'Boat ramp access gate & electrical', amount: 17694 }] },
  { year: 2022, startBalance: 92635, projected: false, roadEscrow: 20000, projects: [{ name: 'Dock improvements (deposit)', amount: 1000 }] },
  { year: 2023, startBalance: 131635, projected: false, roadEscrow: 10000, projects: [{ name: 'Dock improvements', amount: 625 }, { name: 'Woodley & Little Creek road repairs', amount: 7500 }] },
  { year: 2024, startBalance: 153010, projected: false, roadEscrow: 10000, projects: [{ name: 'Custom pool cover & sand filters', amount: 11000 }, { name: 'Paving Wagon Wheel', amount: 48000 }, { name: 'Dock improvements', amount: 20000 }, { name: 'Repair/repave entrance', amount: 5700 }, { name: 'Surveys for culvert work', amount: 1000 }] },
  { year: 2025, startBalance: 110310, projected: true, roadEscrow: 10000, projects: [{ name: 'Culvert work (Little Creek) #1', amount: 17000 }, { name: 'Culvert work (Little Creek) #2', amount: 40000 }] },
  { year: 2026, startBalance: 82310, projected: true, roadEscrow: 10000, projects: [{ name: 'Additional boat storage lot', amount: 18000 }] },
  { year: 2027, startBalance: 93310, projected: true, roadEscrow: 10000, projects: [] },
  { year: 2028, startBalance: 122310, projected: true, roadEscrow: 10000, projects: [] },
  { year: 2029, startBalance: 151310, projected: true, roadEscrow: 10000, projects: [] },
];

export const ACCOUNT_BALANCES = {
  asOf: '2024-06-01',
  source: '2024 Finance Report (annual meeting)',
  accounts: [
    { name: 'Operating checking', amount: 44181 },
    { name: 'Reserve money market', amount: 113262 },
    { name: 'Certificate of deposit', amount: 50574 },
    { name: 'Debit card', amount: 500 },
  ],
};

export const sum = (lines: Line[], filter: (x: Line) => boolean = () => true) => lines.filter(filter).reduce((t, x) => t + x.amount, 0);
