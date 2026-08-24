/**
 * Machine-readable error codes returned from the attendance RPC and mapped to
 * friendly Persian messages. Technical details never reach the end user.
 */
export const ATTENDANCE_ERROR_CODES = {
  unauthenticated: "برای ثبت حضور ابتدا وارد حساب خود شوید.",
  inactive_profile: "حساب کاربری شما فعال نیست. با مدیر سامانه تماس بگیرید.",
  no_workplace: "محل کاری برای شما تعیین نشده است. با مدیر سامانه تماس بگیرید.",
  workplace_inactive: "محل کاری تعیین‌شده غیرفعال است. با مدیر سامانه تماس بگیرید.",
  poor_accuracy: "دقت موقعیت مکانی کافی نیست. لطفاً موقعیت دقیق (GPS) را فعال کنید، نزدیک پنجره یا فضای باز بروید و دوباره تلاش کنید.",
  out_of_range: "شما خارج از محدوده مجاز محل کار قرار دارید.",
  already_checked_in: "ورود شما قبلاً ثبت شده است. برای ثبت خروج اقدام کنید.",
  no_open_session: "ابتدا باید ورود خود را ثبت کنید.",
  duplicate_submission: "درخواست تکراری؛ کمی صبر کنید و دوباره امتحان کنید.",
  invalid_photo: "عکس ثبت‌شده معتبر نیست. دوباره عکس بگیرید.",
  server_error: "خطای غیرمنتظره در سرور رخ داد. لطفاً دوباره تلاش کنید.",
} as const;

export type AttendanceErrorCode = keyof typeof ATTENDANCE_ERROR_CODES;

export function attendanceErrorMessage(code: string | undefined | null): string {
  if (!code) return ATTENDANCE_ERROR_CODES.server_error;
  return (
    ATTENDANCE_ERROR_CODES[code as AttendanceErrorCode] ??
    ATTENDANCE_ERROR_CODES.server_error
  );
}
