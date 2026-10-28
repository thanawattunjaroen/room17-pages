// Document numbers are reserved permanently, including documents in the recycle bin.
export function allBills(data) {
  return [
    ...data.bills,
    ...(data.deletedBills || []),
    ...(data.deletedRooms || []).flatMap((room) => room.bills || []),
  ];
}

export function localDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function ensureDocumentNumbers(data) {
  const bills = allBills(data);
  if (!bills.length && !data.documentNumbers) return;
  data.documentNumbers ??= [];
  const used = new Set(data.documentNumbers);
  for (const bill of bills) {
    for (const number of [bill.billNo, bill.receiptNo]) if (number) used.add(number);
  }
  const next = (prefix, year) => {
    const stem = `${prefix}-${year}-`;
    let maximum = 0;
    for (const number of used) {
      if (number.startsWith(stem) && /^\d+$/.test(number.slice(stem.length))) {
        maximum = Math.max(maximum, Number(number.slice(stem.length)));
      }
    }
    const number = `${stem}${String(maximum + 1).padStart(4, "0")}`;
    used.add(number);
    return number;
  };
  for (const bill of bills) {
    bill.billNo ||= next("INV", bill.period.slice(0, 4));
    if (bill.paid && !bill.receiptNo) {
      bill.receiptNo = next("REC", (localDate(bill.paidAt) || bill.period).slice(0, 4));
    }
  }
  data.documentNumbers = [...used];
}

export function buildReport(data, mode, period) {
  if (
    !["month", "year"].includes(mode) ||
    !(mode === "month" ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}$/).test(period)
  ) {
    throw Error("กรุณาเลือกเดือนหรือปีที่ถูกต้อง");
  }
  const matches = (date) => date && date.startsWith(period);
  const bills = [...new Map(allBills(data).map((bill) => [bill.id, bill])).values()];
  const missingDates = bills.filter((bill) => bill.paid && !localDate(bill.paidAt)).length;
  const income = bills
    .filter((bill) => bill.paid && matches(localDate(bill.paidAt)))
    .map((bill) => ({
      id: bill.id,
      date: localDate(bill.paidAt),
      number: bill.receiptNo || "-",
      description: `ห้อง ${bill.number} · ${bill.tenant || "-"} · รอบ ${bill.period}`,
      amount: bill.total,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  const expenses = (data.expenses || [])
    .filter((item) => matches(item.date))
    .map((item) => ({ ...item }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const sum = (items) =>
    Math.round(items.reduce((total, item) => total + Math.round(item.amount * 100), 0)) / 100;
  const received = sum(income),
    spent = sum(expenses);
  const months = Array.from({ length: mode === "year" ? 12 : 1 }, (_, index) => {
    const month = mode === "year" ? `${period}-${String(index + 1).padStart(2, "0")}` : period;
    const incomeTotal = sum(income.filter((item) => item.date.startsWith(month)));
    const expenseTotal = sum(expenses.filter((item) => item.date.startsWith(month)));
    return {
      month,
      income: incomeTotal,
      expenses: expenseTotal,
      net: Math.round((incomeTotal - expenseTotal) * 100) / 100,
    };
  });
  return {
    mode,
    period,
    income,
    expenses,
    received,
    spent,
    net: Math.round((received - spent) * 100) / 100,
    months,
    missingDates,
  };
}
