// Converts database rows into the JSON shapes the dashboards use.
// Keeping this in one place means every dashboard shows a hospital the same way.

const DIALABLE_PHONE = /^\+?[0-9][0-9 -]{5,19}$/;

const AVAILABILITY_NOTE = {
  not_connected: 'Availability not connected. No live bed, staff or emergency-capacity feed exists in this demo. A directory entry does not confirm current capacity – contact the hospital to confirm.',
  confirmed_by_authorized_source: 'Availability confirmed by an authorized source at the time shown. It may have changed since.',
};

const PHONE_NOTE = {
  verified: 'Contact number verified.',
  unverified: 'Contact number not verified – confirm before relying on it.',
  demo_placeholder: 'DEMO placeholder number for a fictional hospital – not a real phone line.',
  unavailable: 'No contact number on record.',
};

function hospitalView(h) {
  const callable = h.phone_status === 'verified' && DIALABLE_PHONE.test(h.phone || '');
  return {
    id: h.id,
    cityId: h.city_id,
    name: h.name,
    address: h.address,
    lat: h.lat,
    lng: h.lng,
    phone: h.phone,
    phoneStatus: h.phone_status,
    phoneNote: PHONE_NOTE[h.phone_status],
    callable,
    emergencyCapability: h.emergency_capability,
    emergencyCapabilityLabel: h.emergency_capability === 'verified' ? 'Emergency Capability Verified' : 'Emergency Capability Unverified',
    availability: {
      status: h.availability_status,
      label: h.availability_status === 'confirmed_by_authorized_source' ? 'Availability Confirmed by Authorized Source' : 'Availability Not Connected',
      source: h.availability_source,
      confirmedAt: h.availability_confirmed_at,
      note: AVAILABILITY_NOTE[h.availability_status],
    },
    dataSource: h.data_source,
    verificationNote: h.verification_note,
    verifiedBy: h.verified_by,
    verifiedAt: h.verified_at,
    updatedAt: h.updated_at,
  };
}

module.exports = { hospitalView, DIALABLE_PHONE };
