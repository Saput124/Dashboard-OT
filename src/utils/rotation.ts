import { addDays, format, isSunday, startOfDay, differenceInDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { JenisOvertime, Pekerja } from '../types'

interface GenerateOptions {
  startDate: Date
  endDate: Date
  selectedPekerjaIds: string[]
  selectedOvertimeIds: string[]
  rotationDays?: number // Berapa hari sekali rotasi (default 4)
  excludeSunday?: boolean // Skip hari Minggu
}

/**
 * Algoritma Generate dengan Balance yang Lebih Baik
 * Contoh: 20 pekerja, alokasi 13, rotasi 4 hari, 12 hari kerja
 * - Hari 1-4: pekerja 1-13
 * - Hari 5-8: pekerja 14-20 + 1-6 (7 dari pool kedua, 6 dari awal)
 * - Hari 9-12: pekerja 7-19
 * - Balance: pekerja 20 dapat kurang, maka replace di hari 9-12
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
    rotationDays = 4,
    excludeSunday = true
  } = options
  
  // Filter selected pekerja and overtime
  const selectedPekerja = pekerjaList.filter(p => selectedPekerjaIds.includes(p.id))
  const selectedOvertime = jenisOvertimeList.filter(ot => selectedOvertimeIds.includes(ot.id))
  
  if (selectedPekerja.length === 0 || selectedOvertime.length === 0) {
    throw new Error('Pilih minimal 1 pekerja dan 1 jenis overtime')
  }

  // Hitung hari kerja
  const totalDays = differenceInDays(endDate, startDate) + 1
  const workDays: Date[] = []
  for (let i = 0; i < totalDays; i++) {
    const currentDate = addDays(startOfDay(startDate), i)
    if (excludeSunday && isSunday(currentDate)) {
      continue
    }
    workDays.push(currentDate)
  }

  const totalWorkDays = workDays.length
  const schedules: any[] = []
  
  // Process per jenis overtime
  for (const jenisOT of selectedOvertime) {
    const alokasi = jenisOT.alokasi_pekerja
    const totalPekerja = selectedPekerja.length
    
    // Hitung ideal assignment
    const totalSlots = totalWorkDays * alokasi
    const idealPerPerson = Math.floor(totalSlots / totalPekerja)
    const remainder = totalSlots % totalPekerja
    
    // Track assignment per pekerja untuk OT ini
    const assignments: { [pekerjaId: string]: number } = {}
    selectedPekerja.forEach(p => { assignments[p.id] = 0 })
    
    // Temporary schedule untuk OT ini (index adalah tanggal)
    const tempSchedule: { [tanggal: string]: Pekerja[] } = {}
    
    // FASE 1: Generate rotasi normal berdasarkan rotationDays
    let pekerjaIndex = 0
    
    for (let dayIndex = 0; dayIndex < totalWorkDays; dayIndex++) {
      const currentDate = workDays[dayIndex]
      const tanggal = format(currentDate, 'yyyy-MM-dd')
      tempSchedule[tanggal] = []
      
      // Assign pekerja untuk hari ini
      for (let slot = 0; slot < alokasi; slot++) {
        const pekerja = selectedPekerja[pekerjaIndex % totalPekerja]
        tempSchedule[tanggal].push(pekerja)
        assignments[pekerja.id]++
        pekerjaIndex++
      }
    }
    
    // FASE 2: Balance dengan replacement
    // Cari pekerja yang kurang jadwal (di bawah ideal)
    const underAssigned = selectedPekerja
      .filter(p => assignments[p.id] < idealPerPerson)
      .sort((a, b) => assignments[a.id] - assignments[b.id]) // yang paling sedikit duluan
    
    if (underAssigned.length > 0) {
      // Replace dari hari-hari terakhir
      for (const underPekerja of underAssigned) {
        const needMore = idealPerPerson - assignments[underPekerja.id]
        if (needMore <= 0) continue
        
        let replaced = 0
        
        // Mulai dari hari terakhir, cari yang bisa di-replace
        for (let dayIndex = totalWorkDays - 1; dayIndex >= 0 && replaced < needMore; dayIndex--) {
          const tanggal = format(workDays[dayIndex], 'yyyy-MM-dd')
          const dayAssignments = tempSchedule[tanggal]
          
          // Cari pekerja yang over-assigned di hari ini untuk di-replace
          for (let i = 0; i < dayAssignments.length; i++) {
            const currentPekerja = dayAssignments[i]
            
            // Replace jika: 
            // 1. Pekerja ini punya assignment > ideal
            // 2. Bukan pekerja yang sama dengan yang butuh lebih
            // 3. Pekerja under belum ada di hari ini
            if (
              assignments[currentPekerja.id] > idealPerPerson && 
              currentPekerja.id !== underPekerja.id &&
              !dayAssignments.some(p => p.id === underPekerja.id)
            ) {
              // Replace
              dayAssignments[i] = underPekerja
              assignments[currentPekerja.id]--
              assignments[underPekerja.id]++
              replaced++
              break // pindah ke hari berikutnya
            }
          }
        }
      }
    }
    
    // Convert to final schedule dengan grup rotasi
    Object.entries(tempSchedule).forEach(([tanggal, assignedPekerja]) => {
      const dayIndex = workDays.findIndex(d => format(d, 'yyyy-MM-dd') === tanggal)
      const grupRotasi = Math.floor(dayIndex / rotationDays) + 1
      
      schedules.push({
        tanggal,
        jenis_overtime_id: jenisOT.id,
        grup_rotasi: grupRotasi,
        is_minggu: false,
        durasi_jam: jenisOT.durasi_jam,
        assigned_pekerja: assignedPekerja,
        jenis_overtime: jenisOT
      })
    })
  }
  
  // Sort by tanggal
  schedules.sort((a, b) => a.tanggal.localeCompare(b.tanggal))
  
  return schedules
}

// Export alias untuk backward compatibility
export const generateRotationSchedule = generateBalancedRotationSchedule

export const saveRotationSchedule = async (schedules: any[]) => {
  try {
    // Simpan rencana overtime
    for (const schedule of schedules) {
      const { assigned_pekerja, jenis_overtime, ...rencanaData } = schedule
      
      // Insert rencana
      const { data: rencana, error: rencanaError } = await supabase
        .from('rencana_overtime')
        .insert(rencanaData)
        .select()
        .single()

      if (rencanaError) {
        console.error('Error inserting rencana:', rencanaError)
        continue
      }

      // Insert pekerja yang ditugaskan
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
