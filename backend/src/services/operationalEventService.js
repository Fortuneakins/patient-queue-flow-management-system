async function appendOperationalEvent(client, event) {
  const metadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata) ? event.metadata : {};
  await client.query(
    `INSERT INTO operational_events (event_type, entity_type, entity_id, actor_staff_id, from_state, to_state, metadata, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::uuid)`,
    [event.eventType, event.entityType, event.entityId === undefined ? null : String(event.entityId), event.actorStaffId || null, event.fromState || null, event.toState || null, JSON.stringify(metadata), event.correlationId || null]
  );
}
module.exports = { appendOperationalEvent };
