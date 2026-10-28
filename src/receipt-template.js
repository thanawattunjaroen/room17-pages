// Editable business details copied from the owner's reference form.
export const RECEIPT_DEFAULTS = {
  "receiptBusinessName": "TANCHAROEN PLACE",
  "receiptAddress": "",
  "receiptPhone": "",
  "receiptReceiver": "",
  "receiptTaxId": ""
};

export function thaiBahtText(amount) {
  const digits = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  function integerText(value) {
    if (value >= 1000000)
      return (
        integerText(Math.floor(value / 1000000)) +
        "ล้าน" +
        (value % 1000000 ? integerText(value % 1000000) : "")
      );
    const string = String(value);
    const units = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
    return [...string]
      .map((digit, index) => {
        const number = Number(digit),
          place = string.length - index - 1;
        if (!number) return "";
        if (place === 1) return (number === 1 ? "" : number === 2 ? "ยี่" : digits[number]) + "สิบ";
        if (place === 0 && number === 1 && value > 10) return "เอ็ด";
        return digits[number] + units[place];
      })
      .join("");
  }
  const satang = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(satang) || satang < 0) return "-";
  const baht = Math.floor(satang / 100),
    fraction = satang % 100;
  return (
    (baht ? integerText(baht) : "ศูนย์") +
    "บาท" +
    (fraction ? integerText(fraction) + "สตางค์" : "ถ้วน")
  );
}
