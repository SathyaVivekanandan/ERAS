// Assistance-request statuses and the only transitions the backend allows.

const STATUS_LABELS = {
  new: 'New',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  solved: 'Solved',
  unable_to_resolve: 'Unable to Resolve',
};

const STATUS_DESCRIPTIONS = {
  new: 'Awaiting acknowledgement.',
  acknowledged: 'Reviewed by the police demo user.',
  in_progress: 'Assistance being handled in the demo.',
  solved: 'Marked resolved in the demo. This does NOT confirm that a real road was cleared.',
  unable_to_resolve: 'Assistance could not be completed in the demo.',
};

const TRANSITIONS = {
  new: ['acknowledged', 'unable_to_resolve'],
  acknowledged: ['in_progress', 'unable_to_resolve'],
  in_progress: ['solved', 'unable_to_resolve'],
  solved: [],
  unable_to_resolve: [],
};

const OPEN_STATUSES = ['new', 'acknowledged', 'in_progress'];

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

module.exports = { STATUS_LABELS, STATUS_DESCRIPTIONS, TRANSITIONS, OPEN_STATUSES, canTransition };
