// Shared DOM and display helpers. No room or billing rules belong here.
export const $ = (selector) => document.querySelector(selector);

export function formatMoney(amount) {
  return Number(amount).toLocaleString("th-TH");
}

// Escape user-entered text before inserting it into an HTML template.
export function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character]);
}

export function getCurrentMonth() {
  return new Date().toLocaleDateString("en-CA", { year: "numeric", month: "2-digit" });
}

export function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 2800);
}
