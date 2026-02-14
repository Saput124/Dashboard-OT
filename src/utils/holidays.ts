/**
 * Kalender Libur Nasional Indonesia 2026
 * Sumber: Kalender resmi pemerintah Indonesia
 * 
 * Format: YYYY-MM-DD
 */

export interface Holiday {
  date: string
  name: string
  isNational: boolean // true = libur nasional, false = cuti bersama
}

export const INDONESIA_HOLIDAYS_2026: Holiday[] = [
  // Januari 2026
  { date: '2026-01-01', name: 'Tahun Baru Masehi', isNational: true },
  
  // Februari 2026
  { date: '2026-02-17', name: 'Tahun Baru Imlek 2577 Kongzili', isNational: true },
  
  
  // Maret 2026
  { date: '2026-03-14', name: 'Hari Suci Nyepi Tahun Baru Saka 1948', isNational: true },
  { date: '2026-03-22', name: 'Tahun Baru Hijriyah 1448 H', isNational: true },
  
  // April 2026
  { date: '2026-04-03', name: 'Wafat Isa Al-Masih', isNational: true },
  
  // Mei 2026
  { date: '2026-05-01', name: 'Hari Buruh Internasional', isNational: true },
  { date: '2026-05-14', name: 'Kenaikan Isa Al-Masih', isNational: true },
  { date: '2026-05-26', name: 'Hari Raya Waisak 2570 BE', isNational: true },
  
  // Juni 2026
  { date: '2026-06-01', name: 'Hari Lahir Pancasila', isNational: true },
  
  // Juli 2026
  // Tidak ada libur nasional
  
  // Agustus 2026
  { date: '2026-08-17', name: 'Hari Kemerdekaan RI', isNational: true },
  
  // September 2026
  // Tidak ada libur nasional
  
  // Oktober 2026
  { date: '2026-10-24', name: 'Maulid Nabi Muhammad SAW', isNational: true },
  
  // November 2026
  // Tidak ada libur nasional
  
  // Desember 2026
  { date: '2026-12-25', name: 'Hari Raya Natal', isNational: true },
  
  // CATATAN: Tanggal Idul Fitri dan Idul Adha akan ditentukan berdasarkan
  // rukyatul hilal (pengamatan bulan) sehingga dapat berubah
  // Perkiraan sementara (akan diupdate):
  { date: '2026-03-20', name: 'Idul Fitri 1447 H (Hari Pertama)', isNational: true },
  { date: '2026-03-21', name: 'Idul Fitri 1447 H (Hari Kedua)', isNational: true },
  { date: '2026-06-06', name: 'Idul Adha 1447 H', isNational: true },
]

// Cuti bersama (biasanya diumumkan menjelang akhir tahun sebelumnya)
export const INDONESIA_CUTI_BERSAMA_2026: Holiday[] = [
  // Akan diupdate sesuai SKB 3 Menteri
  // Contoh: sebelum/sesudah Lebaran, Natal, dll
  { date: '2026-03-19', name: 'Cuti Bersama Idul Fitri', isNational: false },
  { date: '2026-03-23', name: 'Cuti Bersama Idul Fitri', isNational: false },
  { date: '2026-03-24', name: 'Cuti Bersama Idul Fitri', isNational: false },
  { date: '2026-12-24', name: 'Cuti Bersama Natal', isNational: false },
]

/**
 * Get all holidays (national + cuti bersama)
 */
export const getAllHolidays = (): Holiday[] => {
  return [...INDONESIA_HOLIDAYS_2026, ...INDONESIA_CUTI_BERSAMA_2026]
}

/**
 * Check if a date is a holiday
 */
export const isHoliday = (date: Date): boolean => {
  const dateStr = formatDateForHoliday(date)
  return getAllHolidays().some(h => h.date === dateStr)
}

/**
 * Check if a date is Sunday
 */
export const isSunday = (date: Date): boolean => {
  return date.getDay() === 0
}

/**
 * Check if a date should be skipped (Sunday OR Holiday)
 */
export const shouldSkipDate = (date: Date): boolean => {
  return isSunday(date) || isHoliday(date)
}

/**
 * Get holiday name for a date
 */
export const getHolidayName = (date: Date): string | null => {
  const dateStr = formatDateForHoliday(date)
  const holiday = getAllHolidays().find(h => h.date === dateStr)
  return holiday ? holiday.name : null
}

/**
 * Format date to YYYY-MM-DD for holiday comparison
 */
const formatDateForHoliday = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get all work days between two dates (excluding Sundays and holidays)
 */
export const getWorkDays = (startDate: Date, endDate: Date): Date[] => {
  const workDays: Date[] = []
  const current = new Date(startDate)
  
  while (current <= endDate) {
    if (!shouldSkipDate(current)) {
      workDays.push(new Date(current))
    }
    current.setDate(current.getDate() + 1)
  }
  
  return workDays
}

/**
 * Count work days between two dates
 */
export const countWorkDays = (startDate: Date, endDate: Date): number => {
  return getWorkDays(startDate, endDate).length
}
