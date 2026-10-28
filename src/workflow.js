// Pure monthly calculations shared by editing, deleting and restoring data.
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function previousReading(data, room, period) {
  const key = Object.keys(data.meters)
    .filter((key) => key.startsWith(room.id + ":") && key.split(":")[1] < period)
    .sort()
    .at(-1);
  return key ? data.meters[key] : { water: room.water, electric: room.electric };
}

export function calculateBill(data, room, period, existing = {}) {
  const reading = data.meters[room.id + ":" + period];
  if (!reading) return null;
  const previous = previousReading(data, room, period);
  const waterUnits = round(reading.water - previous.water);
  const electricUnits = round(reading.electric - previous.electric);
  if (waterUnits < 0 || electricUnits < 0) throw new Error("เลขสิ้นเดือนต้องไม่น้อยกว่าเลขตั้งต้น");
  const rates = existing.rates || { water: data.settings.water, electric: data.settings.electric };
  const rent = existing.rent ?? room.rent;
  const water = round(waterUnits * rates.water);
  const electric = round(electricUnits * rates.electric);
  return {
    ...existing,
    roomId: room.id,
    number: room.number,
    tenant: room.tenant,
    tenantAddress: existing.tenantAddress ?? room.tenantAddress ?? "",
    tenantTaxId: existing.tenantTaxId ?? room.tenantTaxId ?? "",
    tenantPhone: existing.tenantPhone ?? room.phone ?? "",
    period,
    due: existing.due || `${period}-${String(data.settings.billDay).padStart(2, "0")}`,
    rent,
    waterUnits,
    electricUnits,
    rates,
    water,
    electric,
    total: round(rent + water + electric),
    paid: existing.paid ?? false,
  };
}

// Recalculate affected draft bills and return a human-readable impact preview.
export function reconcileRoomBills(data, roomId) {
  const room = data.rooms.find((room) => room.id === roomId);
  const changes = [];
  data.deletedBills ??= [];
  data.bills = data.bills.flatMap((bill) => {
    if (bill.roomId !== roomId) return [bill];
    const updated = calculateBill(data, room, bill.period, bill);
    if (!updated) {
      data.deletedBills.push(bill);
      changes.push(
        `${bill.period}: ย้ายบิล ฿${bill.total} ไปถังขยะ${bill.paid ? " และยกเลิกสถานะชำระ" : ""}`,
      );
      return [];
    }
    if (
      updated.water !== bill.water ||
      updated.electric !== bill.electric ||
      updated.total !== bill.total
    ) {
      changes.push(
        `${bill.period}: ฿${bill.total} → ฿${updated.total}${bill.paid ? " (ยกเลิกสถานะชำระ ต้องตรวจสอบใหม่)" : ""}`,
      );
      updated.paid = false;
      updated.paidAt = null;
    }
    return [updated];
  });
  return changes;
}
