async function allocateDailyTicket(client, ticketDate) {
  const result = await client.query(
    `INSERT INTO ticket_counters (ticket_date, last_seq)
     VALUES ($1, 1)
     ON CONFLICT (ticket_date) DO UPDATE SET last_seq = ticket_counters.last_seq + 1
     RETURNING last_seq`,
    [ticketDate]
  );
  const seq = Number(result.rows[0].last_seq);
  if (seq > 9999) throw Object.assign(new Error('Daily ticket capacity exceeded.'), { status: 409 });
  return `TKT-${String(seq).padStart(4, '0')}`;
}
module.exports = { allocateDailyTicket };
