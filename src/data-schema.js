// Shared by the browser and local server. Never overwrite the data file with an invalid backup.
export const INITIAL_STATE = {
  rooms: [],
  meters: {},
  bills: [],
  settings: { name: "TANCHAROEN PLACE", billDay: 1, water: 18, electric: 8 },
};

export function validateData(data) {
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);
  const amount = (value) => Number.isFinite(value) && value >= 0;
  const period = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  if (
    !object(data) ||
    !Array.isArray(data.rooms) ||
    !object(data.meters) ||
    !Array.isArray(data.bills) ||
    !object(data.settings)
  )
    throw Error("โครงสร้างข้อมูลไม่ถูกต้อง");
  if (
    typeof data.settings.name !== "string" ||
    !Number.isInteger(data.settings.billDay) ||
    data.settings.billDay < 1 ||
    data.settings.billDay > 28 ||
    !amount(data.settings.water) ||
    !amount(data.settings.electric)
  )
    throw Error("การตั้งค่าไม่ถูกต้อง");
  const ids = new Set();
  const numbers = new Set();
  for (const room of data.rooms) {
    if (
      !object(room) ||
      typeof room.id !== "string" ||
      !room.id ||
      room.id.includes(":") ||
      ids.has(room.id) ||
      typeof room.number !== "string" ||
      !room.number.trim() ||
      numbers.has(room.number) ||
      !["occupied", "empty", "repair"].includes(room.status) ||
      !amount(room.rent) ||
      !amount(room.water) ||
      !amount(room.electric)
    )
      throw Error("ข้อมูลห้องพักไม่ถูกต้องหรือซ้ำกัน");
    ids.add(room.id);
    numbers.add(room.number);
  }
  for (const [key, reading] of Object.entries(data.meters)) {
    const [id, month, extra] = key.split(":");
    if (
      extra ||
      !ids.has(id) ||
      !period(month) ||
      !object(reading) ||
      !amount(reading.water) ||
      !amount(reading.electric)
    )
      throw Error("ข้อมูลมิเตอร์ไม่ถูกต้อง");
  }
  for (const room of data.rooms) {
    let previous = { water: room.water, electric: room.electric };
    for (const key of Object.keys(data.meters)
      .filter((key) => key.startsWith(room.id + ":"))
      .sort()) {
      const reading = data.meters[key];
      if (reading.water < previous.water || reading.electric < previous.electric)
        throw Error("เลขมิเตอร์ไม่ต่อเนื่อง");
      previous = reading;
    }
  }
  const billIds = new Set();
  const billMonths = new Set();
  for (const bill of data.bills) {
    const key = `${bill.roomId}:${bill.period}`;
    if (
      !object(bill) ||
      !ids.has(bill.roomId) ||
      typeof bill.id !== "string" ||
      billIds.has(bill.id) ||
      billMonths.has(key) ||
      !period(bill.period) ||
      ![bill.rent, bill.water, bill.electric, bill.total].every(amount) ||
      typeof bill.paid !== "boolean"
    )
      throw Error("ข้อมูลบิลไม่ถูกต้องหรือซ้ำกัน");
    billIds.add(bill.id);
    billMonths.add(key);
  }
  if (data.deletedMeters !== undefined && !object(data.deletedMeters))
    throw Error("ข้อมูลกู้คืนมิเตอร์ไม่ถูกต้อง");
  for (const name of ["deletedBills", "deletedRooms"])
    if (data[name] !== undefined && !Array.isArray(data[name]))
      throw Error("ข้อมูลกู้คืนไม่ถูกต้อง");
  const documentNumbers = new Set();
  const documents = [
    ...data.bills,
    ...(data.deletedBills || []),
    ...(data.deletedRooms || []).flatMap((room) => room.bills || []),
  ];
  for (const bill of documents) {
    for (const field of ["billNo", "receiptNo"]) {
      const number = bill[field];
      if (number === undefined || number === "") continue;
      if (typeof number !== "string" || number !== number.trim() || documentNumbers.has(number))
        throw Error("เลขบิลหรือใบเสร็จซ้ำกันหรือไม่ถูกต้อง");
      documentNumbers.add(number);
    }
    if (bill.paidAt && !Number.isFinite(new Date(bill.paidAt).getTime()))
      throw Error("วันที่รับชำระไม่ถูกต้อง");
  }
  if (
    data.documentNumbers !== undefined &&
    (!Array.isArray(data.documentNumbers) ||
      data.documentNumbers.some((number) => typeof number !== "string" || !number.trim()) ||
      new Set(data.documentNumbers).size !== data.documentNumbers.length)
  )
    throw Error("ทะเบียนเลขเอกสารไม่ถูกต้อง");
  if (data.expenses !== undefined && !Array.isArray(data.expenses))
    throw Error("ข้อมูลรายจ่ายไม่ถูกต้อง");
  const expenseIds = new Set();
  for (const expense of data.expenses || []) {
    if (
      !object(expense) ||
      typeof expense.id !== "string" ||
      !expense.id ||
      expenseIds.has(expense.id) ||
      typeof expense.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(expense.date) ||
      !Number.isFinite(new Date(expense.date).getTime()) ||
      new Date(expense.date).toISOString().slice(0, 10) !== expense.date ||
      !amount(expense.amount) ||
      expense.amount === 0 ||
      typeof expense.description !== "string" ||
      !expense.description.trim() ||
      typeof expense.category !== "string" ||
      !expense.category.trim()
    )
      throw Error("ข้อมูลรายจ่ายไม่ถูกต้องหรือซ้ำกัน");
    expenseIds.add(expense.id);
  }
  return data;
}
