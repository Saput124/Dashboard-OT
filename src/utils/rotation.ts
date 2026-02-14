import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { getWorkDays } from './holidays'
import type { JenisOvertime, Pekerja } from '../types'

interface GenerateOptions {
  startDate: Date
  endDate: Date
  selectedPekerjaIds: string[]
  selectedOvertimeIds: string[]
  intervalDays?: number // Rotasi setiap berapa hari (default 4)
  excludeWeekends?: boolean // Skip Minggu & tanggal merah (default true)
}

/**
 * Algoritma Fair Rotation dengan Round-Robin
 * 
 * TUJUAN: Distribusi JAM OT yang merata untuk semua pekerja
 * 
 * CARA KERJA:
 * 1. Kelompok pekerja yang sama bekerja bersama untuk X hari (intervalDays)
 * 2. Track TOTAL JAM OT per pekerja (bukan cuma jumlah hari)
 * 3. Auto-balance: replace pekerja yang over dengan yang under
 * 
 * CONTOH:
 * - 20 pekerja, alokasi 13/hari, interval 4 hari, 12 hari kerja, 2 jam/hari
 * - Total JAM OT: 12 × 13 × 2 = 312 jam
 * - Target per orang: 312 ÷ 20 = 15.6 jam (sekitar 8 hari)
 * 
 * Periode 1 (16-19 Feb): Pekerja 1-13 → 4 hari × 2 jam = 8 jam
 * Periode 2 (20-22,24 Feb): Pekerja 14-20,1-6 → 4 hari × 2 jam = 8 jam
 * Periode 3 (25-28 Feb): Pekerja 7-19 → 4 hari × 2 jam = 8 jam
 * 
 * Auto-balance: Pekerja 20 hanya 8 jam (kurang 8 jam!)
 * → Replace 4 hari di Periode 3
 * 
 * HASIL: Semua 14-16 jam (gap ≤ 2 jam)
 */
export const generateBalancedRotationSchedule = async (
  options: GenerateOptions,
  jenisOvertimeList: JenisOvertime[],
  pekerjaList: Pekerja[]
) => {
  const { 
    startDate, 
    endDate, 
    selectedPekerjaIds, 
    selectedOvertimeIds,
    intervalDays = 4,
    excludeWeekends = true
  } = options
  
  // Filter pekerja & overtime
  const selectedPekerja = pekerjaList.filter(p => selectedPekerjaIds.includes(p.id))
  const selectedOvertime = jenisOvertimeList.filter(ot => selectedOvertimeIds.includes(ot.id))
  
  if (selectedPekerja.length === 0 || selectedOvertime.length === 0) {
    throw new Error('Pilih minimal 1 pekerja dan 1 jenis overtime')
  }

  // Hitung hari kerja (auto skip Minggu & tanggal merah)
  const workDays = excludeWeekends 
    ? getWorkDays(startDate, endDate)
    : getAllDays(startDate, endDate)
  
  const totalWorkDays = workDays.length
  
  if (totalWorkDays === 0) {
    throw new Error('Tidak ada hari kerja dalam periode yang dipilih (semua Minggu/libur)')
  }
  
  const schedules: any[] = []
  
  // Process setiap jenis overtime
  for (const jenisOT of selectedOvertime) {
    const alokasi = jenisOT.alokasi_pekerja
    const totalPekerja = selectedPekerja.length
    const durasiJam = jenisOT.durasi_jam
    
    // Target JAM OT per pekerja (BUKAN hari!)
    const totalJamOT = totalWorkDays * alokasi * durasiJam
    const targetJamPerPerson = totalJamOT / totalPekerja
    
    // Track JAM OT (bukan jumlah hari)
    const jamOTTracker: { [pekerjaId: string]: number } = {}
    selectedPekerja.forEach(p => { jamOTTracker[p.id] = 0 })
    
    // Temporary schedule
    const tempSchedule: { [tanggal: string]: Pekerja[] } = {}
    
    // ========================================
    // FASE 1: Round-Robin dengan Interval
    // ========================================
    // Kelompok pekerja yang SAMA bekerja bersama untuk intervalDays hari
    
    let pekerjaStartIndex = 0
    let currentPeriod = 0
    
    for (let dayIndex = 0; dayIndex < totalWorkDays; dayIndex++) {
      // Ganti periode setiap intervalDays
      if (dayIndex > 0 && dayIndex % intervalDays === 0) {
        currentPeriod++
        // Move ke pekerja berikutnya
        pekerjaStartIndex += alokasi
      }
      
      const currentDate = workDays[dayIndex]
      const tanggal = format(currentDate, 'yyyy-MM-dd')
      
      // Pilih pekerja untuk hari ini (SAMA dengan hari lain dalam periode yang sama)
      const periodPekerja: Pekerja[] = []
      for (let i = 0; i < alokasi; i++) {
        const pekerja = selectedPekerja[(pekerjaStartIndex + i) % totalPekerja]
        periodPekerja.push(pekerja)
      }
      
      // Assign
      tempSchedule[tanggal] = [...periodPekerja]
      
      // Update JAM OT
      periodPekerja.forEach(p => {
        jamOTTracker[p.id] += durasiJam
      })
    }
    
    // ========================================
    // FASE 2: Auto-Balance berdasarkan JAM OT
    // ========================================
    
    const sortedByJam = Object.entries(jamOTTracker)
      .sort(([, jamA], [, jamB]) => jamA - jamB)
    
    const minJam = sortedByJam[0][1]
    const maxJam = sortedByJam[sortedByJam.length - 1][1]
    const gapJam = maxJam - minJam
    
    // Balance jika gap > 1 hari OT
    if (gapJam > durasiJam) {
      const underAssigned = sortedByJam
        .filter(([, jam]) => jam < targetJamPerPerson)
        .map(([id]) => id)
      
      const overAssigned = sortedByJam
        .filter(([, jam]) => jam > targetJamPerPerson)
        .map(([id]) => id)
      
      // Replace dari hari terakhir ke awal
      for (const underId of underAssigned) {
        const underPekerja = selectedPekerja.find(p => p.id === underId)!
        const needMoreJam = targetJamPerPerson - jamOTTracker[underId]
        
        if (needMoreJam <= 0) continue
        
        let replacedJam = 0
        
        // Loop dari belakang
        for (let i = workDays.length - 1; i >= 0 && replacedJam < needMoreJam; i--) {
          const tanggal = format(workDays[i], 'yyyy-MM-dd')
          const dayAssignments = tempSchedule[tanggal]
          
          // Cari pekerja yang over untuk di-replace
          for (let j = 0; j < dayAssignments.length; j++) {
            const currentPekerja = dayAssignments[j]
            
            if (
              overAssigned.includes(currentPekerja.id) &&
              currentPekerja.id !== underId &&
              !dayAssignments.some(p => p.id === underId) &&
              jamOTTracker[currentPekerja.id] > targetJamPerPerson
            ) {
              // REPLACE!
              dayAssignments[j] = underPekerja
              jamOTTracker[currentPekerja.id] -= durasiJam
              jamOTTracker[underId] += durasiJam
              replacedJam += durasiJam
              break
            }
          }
        }
      }
    }
    
    // ========================================
    // Convert to Final Schedule
    // ========================================
    
    Object.entries(tempSchedule).forEach(([tanggal, assignedPekerja]) => {
      const currentDate = workDays.find(d => format(d, 'yyyy-MM-dd') === tanggal)!
      const dayIndex = workDays.indexOf(currentDate)
      const grupRotasi = Math.floor(dayIndex / intervalDays) + 1
      
      const isSunday = currentDate.getDay() === 0
      
      schedules.push({
        tanggal,
        jenis_overtime_id: jenisOT.id,
        grup_rotasi: grupRotasi,
        is_minggu: isSunday,
        durasi_jam: jenisOT.durasi_jam,
        assigned_pekerja: assignedPekerja,
        jenis_overtime: jenisOT
      })
    })
  }
  
  schedules.sort((a, b) => a.tanggal.localeCompare(b.tanggal))
  
  return schedules
}

// Helper
const getAllDays = (startDate: Date, endDate: Date): Date[] => {
  const days: Date[] = []
  const current = new Date(startDate)
  
  while (current <= endDate) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  
  return days
}

// Export alias
export const generateRotationSchedule = generateBalancedRotationSchedule

export const saveRotationSchedule = async (schedules: any[]) => {
  try {
    for (const schedule of schedules) {
      const { assigned_pekerja, jenis_overtime, ...rencanaData } = schedule
      
      const { data: rencana, error: rencanaError } = await supabase
        .from('rencana_overtime')
        .insert(rencanaData)
        .select()
        .single()

      if (rencanaError) {
        console.error('Error inserting rencana:', rencanaError)
        continue
      }

      if (assigned_pekerja && assigned_pekerja.length > 0) {
        const pekerjaRencanaData = assigned_pekerja.map((p: Pekerja) => ({
          rencana_overtime_id: rencana.id,
          pekerja_id: p.id
        }))

        const { error: pekerjaError } = await supabase
          .from('pekerja_rencana')
          .insert(pekerjaRencanaData)

        if (pekerjaError) {
          console.error('Error inserting pekerja_rencana:', pekerjaError)
        }
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error saving rotation schedule:', error)
    return { success: false, error }
  }
}

export const formatDate = (date: string | Date) => {
  return format(new Date(date), 'dd MMM yyyy')
}

export const formatDateShort = (date: string | Date) => {
  return format(new Date(date), 'dd/MM')
}

export const getDayName = (date: string | Date) => {
  return format(new Date(date), 'EEEE')
}
