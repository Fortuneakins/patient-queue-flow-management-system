const MODEL_VERSION = 'clinic-operations-pressure-1.0.0';

function optionalCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function buildOperationalPressure(snapshot = {}) {
  const waiting = optionalCount(snapshot.waiting);
  const inConsultation = optionalCount(snapshot.in_consultation);
  if (waiting === null || inConsultation === null) {
    return {
      model_version: MODEL_VERSION,
      score: null,
      band: 'UNAVAILABLE',
      explanation: 'Queue counts were not available; a pressure score was not calculated.',
      waiting_per_doctor: null,
      components: []
    };
  }

  const active = waiting + inConsultation;
  const doctors = optionalCount(snapshot.on_duty_doctors);
  const overdue = optionalCount(snapshot.overdue_waiting) ?? 0;
  const rooms = optionalCount(snapshot.available_room_capacity);

  // Maximum 100 points: waiting load 35, overdue share 35,
  // active work with no rostered doctor 20, no available room capacity 10.
  const waitingLoadPoints = doctors === null
    ? 0
    : doctors === 0
      ? (active > 0 ? 35 : 0)
      : Math.min(35, (waiting / (doctors * 6)) * 35);
  const overdueShare = waiting > 0 ? Math.min(1, overdue / waiting) : 0;
  const delayPoints = overdueShare * 35;
  const doctorCoveragePoints = doctors === 0 && active > 0 ? 20 : 0;
  const roomCapacityPoints = rooms === 0 && waiting > 0 ? 10 : 0;
  const score = Math.max(0, Math.min(100, Math.round(
    waitingLoadPoints + delayPoints + doctorCoveragePoints + roomCapacityPoints
  )));
  const band = score >= 75 ? 'CRITICAL'
    : score >= 50 ? 'HIGH'
      : score >= 25 ? 'MODERATE' : 'LOW';

  return {
    model_version: MODEL_VERSION,
    score,
    band,
    waiting_per_doctor: doctors > 0 ? Number((waiting / doctors).toFixed(1)) : null,
    explanation: 'A rule-based operational planning indicator. It is not clinically calibrated and does not set patient priority.',
    components: [
      { id: 'waiting_load', label: 'Waiting load', points: Number(waitingLoadPoints.toFixed(1)), maximum: 35, basis: doctors === null ? 'Roster data unavailable' : doctors === 0 ? 'No rostered doctor while work is active' : waiting + ' waiting visit(s) across ' + doctors + ' rostered doctor(s)' },
      { id: 'delay_exposure', label: 'Delay exposure', points: Number(delayPoints.toFixed(1)), maximum: 35, basis: overdue + ' of ' + waiting + ' waiting visit(s) crossed the configured delay-review threshold' },
      { id: 'doctor_coverage', label: 'Doctor coverage', points: doctorCoveragePoints, maximum: 20, basis: doctors === null ? 'Roster data unavailable' : doctors + ' rostered doctor(s) on duty' },
      { id: 'room_capacity', label: 'Room capacity', points: roomCapacityPoints, maximum: 10, basis: rooms === null ? 'No consultation-room capacity recorded' : rooms + ' available room capacity unit(s)' }
    ]
  };
}

module.exports = { MODEL_VERSION, buildOperationalPressure };
