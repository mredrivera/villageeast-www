import type { Field } from './schema';

export type FormDefinition = {
  type: string;
  /** Short prefix for reference numbers, e.g. ARC-2026-0007. */
  prefix: string;
  title: string;
  blurb: string;
  icon: 'home' | 'boat' | 'deer' | 'flag';
  reviewedBy: string;
  turnaround: string;
  intro: string[];
  /** Which answer best summarises the request in lists. */
  summaryField: string;
  /** Legacy paper form in the document library (matched by title). */
  paperFormTitle?: string;
  fields: Field[];
};

const ATTACH = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MB = 1024 * 1024;

export const FORMS: FormDefinition[] = [
  {
    type: 'arc_request',
    prefix: 'ARC',
    title: 'Architectural review request',
    blurb: 'New homes, additions, docks, fences, sheds, exterior colors, tree removal and other exterior changes.',
    icon: 'home',
    reviewedBy: 'Architectural Review Committee',
    turnaround: 'Decision within 30 days of receiving complete information',
    intro: [
      'Use this form to request Village East Architectural Review Committee (VEARC) approval before starting exterior work.',
      'New home construction requires a $2,000 road impact fee before the request can be considered. Log homes and doublewides are not permitted. Association dues must be current.',
    ],
    summaryField: 'project_type',
    paperFormTitle: 'Architectural Approval Form',
    fields: [
      { type: 'section', label: 'Your project' },
      {
        type: 'select', name: 'project_type', label: 'What are you planning?', required: true,
        options: [
          { value: 'new_home', label: 'New home construction' },
          { value: 'addition', label: 'Addition or major renovation' },
          { value: 'dock', label: 'Dock, boathouse or shoreline work' },
          { value: 'outbuilding', label: 'Garage, shed or other outbuilding' },
          { value: 'fence', label: 'Fence, wall or deck' },
          { value: 'exterior', label: 'Siding, roofing or exterior color change' },
          { value: 'trees', label: 'Tree removal or major landscaping' },
          { value: 'other', label: 'Something else' },
        ],
      },
      { type: 'textarea', name: 'description', label: 'Describe the proposed work', required: true, maxLength: 3000, rows: 5, help: 'Include dimensions and total square footage (main floor, and second floor if applicable).' },
      { type: 'date', name: 'start_date', label: 'Planned start date' },
      { type: 'text', name: 'contractor', label: 'Contractor (if any)', maxLength: 160 },
      { type: 'section', label: 'Details the committee needs', help: 'Answer what applies to your project. You can attach drawings below.' },
      { type: 'text', name: 'siding', label: 'Type and color of siding', maxLength: 200 },
      { type: 'text', name: 'foundation', label: 'Foundation treatment at grade', maxLength: 200, help: 'For example rock, stucco or siding to within 8 inches of grade.' },
      { type: 'textarea', name: 'setbacks', label: 'Distance from structure to each property line', maxLength: 600, rows: 2, help: 'Include overhangs and attachments.' },
      { type: 'textarea', name: 'well_septic', label: 'Location of well and septic system', maxLength: 600, rows: 2 },
      { type: 'textarea', name: 'trees', label: 'Trees to be removed', maxLength: 600, rows: 2 },
      { type: 'textarea', name: 'drainage', label: 'Property drainage plan', maxLength: 600, rows: 2 },
      { type: 'section', label: 'Attachments', help: 'Sketches or drawings showing all four sides and orientation on the lot, the plat or survey showing location, and the septic permit.' },
      { type: 'files', name: 'attachments', label: 'Drawings, plat/survey and permits', accept: ATTACH, maxFiles: 6, maxBytes: 8 * MB, help: 'PDF, JPG, PNG or WebP. Up to 6 files, 8 MB each.' },
      { type: 'section', label: 'Agreement' },
      { type: 'boolean', name: 'road_fee', label: 'For new construction, I understand the $2,000 road impact fee must be paid before this request is considered.' },
      { type: 'boolean', name: 'inspection_consent', label: 'I give the VEARC permission to enter my property to inspect construction at any time until it is complete.', required: true },
      { type: 'text', name: 'signature', label: 'Type your full name as your signature', required: true, maxLength: 120, autocomplete: 'name' },
    ],
  },
  {
    type: 'boat_storage',
    prefix: 'BTS',
    title: 'Boat & trailer storage application',
    blurb: 'Apply for a space in one of the two owner storage lots.',
    icon: 'boat',
    reviewedBy: 'Grounds Committee',
    turnaround: 'Usually assigned within two weeks',
    intro: ['Owners in good standing may store a boat and trailer in the community storage lots. The Grounds Committee assigns the lot and space.'],
    summaryField: 'boat_type',
    paperFormTitle: 'Boat / Trailer Storage Contract',
    fields: [
      { type: 'section', label: 'Contact' },
      { type: 'tel', name: 'phone', label: 'Best phone number', required: true, autocomplete: 'tel' },
      { type: 'text', name: 'other_address', label: 'Other mailing address (if not at Village East)', maxLength: 200 },
      { type: 'section', label: 'Trailer' },
      { type: 'text', name: 'trailer_type', label: 'Type of trailer', required: true, maxLength: 80 },
      { type: 'number', name: 'trailer_length', label: 'Trailer length (feet)', required: true, min: 4, max: 60, step: 0.5 },
      { type: 'text', name: 'trailer_plate', label: 'License plate number', required: true, maxLength: 20 },
      { type: 'text', name: 'trailer_vin', label: 'VIN', maxLength: 30 },
      { type: 'section', label: 'Boat' },
      { type: 'text', name: 'boat_type', label: 'Type of boat', required: true, maxLength: 80, placeholder: 'e.g. 22 ft pontoon' },
      { type: 'number', name: 'boat_length', label: 'Boat length (feet)', required: true, min: 4, max: 60, step: 0.5 },
      { type: 'text', name: 'boat_registration', label: 'Registration number', required: true, maxLength: 30 },
      { type: 'section', label: 'Agreement' },
      { type: 'boolean', name: 'rules_ack', label: 'I have read and will follow the VEPOA Trailer Parking Facilities Rules and Regulations.', required: true },
      { type: 'text', name: 'signature', label: 'Type your full name as your signature', required: true, maxLength: 120, autocomplete: 'name' },
    ],
  },
  {
    type: 'deer_permission',
    prefix: 'DCP',
    title: 'Deer culling permission',
    blurb: 'Tell the board whether licensed cullers may access your lot under the herd management policy.',
    icon: 'deer',
    reviewedBy: 'Board of Directors',
    turnaround: 'Recorded on receipt',
    intro: ['The association manages the deer herd under its published culling policy. Culling only takes place on lots whose owners have given written permission. You can withdraw permission at any time by submitting this form again.'],
    summaryField: 'permission',
    paperFormTitle: 'Permission to Hunt Form',
    fields: [
      {
        type: 'radio', name: 'permission', label: 'May approved cullers access your lot?', required: true,
        options: [
          { value: 'granted', label: 'Yes, I give permission' },
          { value: 'retrieve_only', label: 'Retrieval only (no culling on my lot)' },
          { value: 'denied', label: 'No, I do not give permission' },
        ],
      },
      { type: 'textarea', name: 'conditions', label: 'Conditions or notes for the cullers', maxLength: 800, rows: 3, help: 'For example areas to avoid, pets, or times you prefer not to be disturbed.' },
      { type: 'tel', name: 'phone', label: 'Phone number for notice before access', autocomplete: 'tel' },
      { type: 'text', name: 'signature', label: 'Type your full name as your signature', required: true, maxLength: 120, autocomplete: 'name' },
    ],
  },
  {
    type: 'concern',
    prefix: 'CON',
    title: 'Report a concern',
    blurb: 'Road damage, common-area maintenance, a rules question or a formal complaint.',
    icon: 'flag',
    reviewedBy: 'Board of Directors',
    turnaround: 'Acknowledged within 7 days',
    intro: ['Let the board know about something that needs attention. Formal complaints follow the Association Complaint Procedures in the document library.'],
    summaryField: 'category',
    fields: [
      {
        type: 'select', name: 'category', label: 'What is this about?', required: true,
        options: [
          { value: 'roads', label: 'Roads or drainage' },
          { value: 'pool', label: 'Pool, clubhouse or courts' },
          { value: 'ramp', label: 'Boat ramp, dock or storage lots' },
          { value: 'grounds', label: 'Grounds or green belt' },
          { value: 'rules', label: 'Covenants or rules' },
          { value: 'complaint', label: 'Formal complaint' },
          { value: 'other', label: 'Other' },
        ],
      },
      { type: 'text', name: 'location', label: 'Where?', maxLength: 200, placeholder: 'Street, lot number or landmark' },
      { type: 'textarea', name: 'details', label: 'What should the board know?', required: true, maxLength: 3000, rows: 6 },
      { type: 'files', name: 'photos', label: 'Photos (optional)', accept: ['image/jpeg', 'image/png', 'image/webp'], maxFiles: 4, maxBytes: 8 * MB, help: 'JPG, PNG or WebP. Up to 4 photos, 8 MB each.' },
    ],
  },
];

export const getForm = (type: string) => FORMS.find((f) => f.type === type) ?? null;

export const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  in_review: 'In review',
  needs_info: 'More information needed',
  approved: 'Approved',
  denied: 'Not approved',
  withdrawn: 'Withdrawn',
};
