// Sunucu Almanya'da (UTC/CET), kullanıcılar KKTC'de: tüm gösterilen saatler
// cihaz/sunucu saat diliminden bağımsız olarak KKTC saatiyle yazılır.
export const APP_TZ = "Europe/Nicosia"

export const fmtDateTime = (ts: number | Date = Date.now()) =>
  new Date(ts).toLocaleString("tr-TR", { timeZone: APP_TZ, dateStyle: "long", timeStyle: "short" })

export const fmtShort = (ts: number | Date = Date.now()) =>
  new Date(ts).toLocaleString("tr-TR", {
    timeZone: APP_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

// YYYY-MM-DD (KKTC günü; gece yarısına yakın UTC kaymasını önler)
export const todayISO = (ts: number | Date = Date.now()) =>
  new Date(ts).toLocaleDateString("en-CA", { timeZone: APP_TZ })
