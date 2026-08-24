import { NextResponse, type NextRequest } from "next/server";
import { getAdminOrNull } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getEmployeeSummary, getReportSessions } from "@/lib/reports";
import { dateToJalali, jalaliMonthLength, jalaliToGregorianDate } from "@/lib/jalali";
import { jalaliDayBoundsUTC } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Admin report exports.
 *  - CSV with UTF-8 BOM so Persian opens correctly in Excel
 *  - .xls via SpreadsheetML XML (zero-dependency, Excel-compatible)
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminOrNull();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const format = sp.get("format") === "xls" ? "xls" : "csv";

  const now = new Date();
  const tz = await getTimezone();
  const todayJ = dateToJalali(now, tz);
  const preset = sp.get("p") ?? "month";

  let from = { ...todayJ };
  let to = { ...todayJ };
  if (preset === "custom" && sp.get("from") && sp.get("to")) {
    parse(sp.get("from")!, (r) => (from = r));
    parse(sp.get("to")!, (r) => (to = r));
  } else if (preset === "today") {
    // already
  } else if (preset === "week") {
    from = shift(todayJ, -6, tz);
  } else if (preset === "lastmonth") {
    const pm = todayJ.jm === 1 ? 12 : todayJ.jm - 1;
    const py = todayJ.jm === 1 ? todayJ.jy - 1 : todayJ.jy;
    from = { jy: py, jm: pm, jd: 1 };
    to = { jy: py, jm: pm, jd: jalaliMonthLength(py, pm) };
  } else {
    from = { jy: todayJ.jy, jm: todayJ.jm, jd: 1 };
    to = { ...todayJ };
  }

  const bounds = jalaliDayBoundsUTC(from.jy, from.jm, from.jd, tz);
  const boundsTo = jalaliDayBoundsUTC(to.jy, to.jm, to.jd, tz);
  const fromISO = bounds.start.toISOString().slice(0, 10);
  const toISO = new Date(boundsTo.end.getTime() - 1).toISOString().slice(0, 10);

  const employeeId = sp.get("emp") || null;
  const status = sp.get("st") ?? "all";

  const [sessions, summaries] = await Promise.all([
    getReportSessions(fromISO, toISO, employeeId, sp.get("wp") ? Number(sp.get("wp")) : null),
    getEmployeeSummary(fromISO, toISO),
  ]);

  const filtered = sessions.filter((s) => {
    if (status === "late") return s.late_minutes > 0;
    if (status === "open") return !s.checkout_at;
    return true;
  });

  const summaryHeaders = [
    "کارمند", "کد", "روزهای کاری", "حاضر", "غایب",
    "روز تأخیر", "دقایق تأخیر", "خروج زودهنگام", "بدون خروج", "کارکرد (دقیقه)", "اضافه‌کار (دقیقه)",
  ];
  const detailHeaders = [
    "کارمند", "کد", "محل کار", "تاریخ ورود (سرور)", "ساعت ورود", "ساعت خروج",
    "تأخیر (دقیقه)", "کارکرد (دقیقه)", "اضافه‌کار (دقیقه)", "فاصله ورود (متر)",
    "شعاع مجاز (متر)", "اصلاح‌شده", "مشکوک",
  ];

  const rows: string[][] = summaries.map((r) => [
    r.full_name, r.employee_code ?? "", String(r.expected_days), String(r.present_days),
    String(r.absent_days), String(r.late_days), String(r.late_minutes_total),
    String(r.early_leaves), String(r.missed_checkouts), String(r.worked_minutes_total),
    String(r.overtime_total),
  ]);

  void filtered;

  const detailRows = sessions.map((s) => {
    const inAt = new Date(s.checkin_at);
    return [
      s.full_name,
      s.employee_code ?? "",
      s.workplace_name ?? "",
      isoDateInTz(inAt, tz),
      timeInTz(inAt, tz),
      s.checkout_at ? timeInTz(new Date(s.checkout_at), tz) : "",
      String(s.late_minutes),
      s.worked_minutes != null ? String(s.worked_minutes) : "",
      String(s.overtime_minutes),
      s.checkin_distance_m != null ? String(Math.round(s.checkin_distance_m)) : "",
      s.allowed_radius_m != null ? String(s.allowed_radius_m) : "",
      s.has_manual_adjustment ? "بله" : "خیر",
      s.is_suspicious ? "بله" : "خیر",
    ];
  });

  const filenameBase = `gahan-report-${fromISO}_${toISO}`;

  await writeAudit(admin.profile.user_id, {
    action: `report.export_${format}`,
    entity: "reports",
    meta: { fromISO, toISO, rows: rows.length + detailRows.length },
  });

  if (format === "csv") {
    const lines = [
      ["خلاصه کارمندان"],
      summaryHeaders,
      ...rows,
      [],
      ["رکوردهای تفصیلی"],
      detailHeaders,
      ...detailRows,
    ]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");

    return new NextResponse("\uFEFF" + lines, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // SpreadsheetML (.xls)
  const xml = buildSpreadsheetXml(filenameBase, [
    { name: "خلاصه کارمندان", headers: summaryHeaders, rows },
    { name: "رکوردهای تفصیلی", headers: detailHeaders, rows: detailRows },
  ]);

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.xls"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function buildSpreadsheetXml(
  title: string,
  sheets: Array<{ name: string; headers: string[]; rows: string[][] }>
): string {
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cell = (v: string) => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const sheetXml = sheets
    .map(
      ({ name, headers, rows }) => `
  <Worksheet ss:Name="${esc(name.slice(0, 28))}">
    <Table>
      <Row>${headers.map(cell).join("")}</Row>
      ${rows.map((r) => `<Row>${r.map(cell).join("")}</Row>`).join("\n      ")}
    </Table>
  </Worksheet>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${esc(title)}</Title>
 </DocumentProperties>${sheetXml}
</Workbook>`;
}

async function getTimezone(): Promise<string> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("timezone").eq("id", true).maybeSingle<{ timezone: string }>();
  return data?.timezone ?? "Asia/Tehran";
}

function parse(s: string, cb: (r: { jy: number; jm: number; jd: number }) => void): void {
  const [jy, jm, jd] = s.split("-").map(Number);
  if (jy && jm && jd) cb({ jy, jm, jd });
}

function shift(d: { jy: number; jm: number; jd: number }, days: number, tz: string): { jy: number; jm: number; jd: number } {
  const g = jalaliToGregorianDate(d.jy, d.jm, d.jd);
  return dateToJalali(new Date(g.getTime() + days * 86_400_000), tz);
}

function isoDateInTz(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(date);
}

function timeInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
