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
  maxHoursPerDay?: number // Maksimal jam OT per hari per pekerja (default 2)
}

/**
 * Fetch existing OT assignments from database for given date range
 * Returns map: { [tanggal]: { [pekerjaId]: totalJam } }
 */
const fetchExistingAssignments = async (
  startDate: Date, 
  endDate: Date, 
  pekerjaIds: string[]
): Promise<{ [tanggal: string]: { [pekerjaId: string]: number } }> => {
  const startDateStr = format(startDate, 'yyyy-MM-dd')
  const endDateStr = format(endDate, 'yyyy-MM-dd')
  
  // Fetch existing rencana for this period
  const { data: existingRencana } = await supabase
    .from('rencana_overtime')
    .select(`
      id,
      tanggal,
      durasi_jam,
      pekerja_rencana (
        pekerja_id
      )
    `)
    .gte('tanggal', startDateStr)
    .lte('tanggal', endDateStr)
  
  const dailyWorkloadMap: { [tanggal: string]: { [pekerjaId: string]: number } } = {}
  
  if (existingRencana) {
    for (const rencana of existingRencana) {
      const tanggal = rencana.tanggal
      
      if (!dailyWorkloadMap[tanggal]) {
        dailyWorkloadMap[tanggal] = {}
      }
      
      // Add workload for each assigned pekerja
      if (rencana.pekerja_rencana) {
        for (const pr of rencana.pekerja_rencana) {
          const pekerjaId = pr.pekerja_id
          
          if (pekerjaIds.includes(pekerjaId)) {
            if (!dailyWorkloadMap[tanggal][pekerjaId]) {
              dailyWorkloadMap[tanggal][pekerjaId] = 0
            }
            dailyWorkloadMap[tanggal][pekerjaId] += rencana.durasi_jam
          }
        }
      }
    }
  }
  
  console.log('=== EXISTING ASSIGNMENTS ===')
  console.log('Dates with assignments:', Object.keys(dailyWorkloadMap))
  Object.entries(dailyWorkloadMap).forEach(([tanggal, workloads]) => {
    const workersWithOT = Object.keys(workloads).length
    console.log(`${tanggal}: ${workersWithOT} pekerja sudah ada OT`)
  })
  console.log('============================')
  
  return dailyWorkloadMap
}

/**
 * Algoritma Fair Rotation dengan Round-Robin + MAX HOURS PER DAY CONSTRAINT
 * 
 * TUJUAN: 
 * 1. Distribusi JAM OT yang merata untuk semua pekerja
 * 2. BATASAN: Maksimal 2 jam OT per hari per pekerja
 * 
 * CARA KERJA:
 * 1. Kelompok pekerja yang sama bekerja bersama untuk X hari (intervalDays)
 * 2. Track TOTAL JAM OT per pekerja (bukan cuma jumlah hari)
 * 3. Auto-balance: replace pekerja yang over dengan yang under
 * 4. **BARU**: Check existing assignments & skip jika sudah >= maxHoursPerDay
 * 
 * CONTOH MULTI-GENERATE:
 * 
 * Generate 1 (Lightrap 2 jam):
 * - 16 Feb: Pekerja 1-13 → 2 jam
 * 
 * Generate 2 (Recolonisasi 1 jam):
 * - 16 Feb: Pekerja 14-21 → 1 jam
 * 
 * Generate 3 (Kupu Pagi 1 jam, alokasi 26):
 * - Check existing workload 16 Feb:
 *   - Pekerja 1-13: 2 jam (SKIP - sudah max!)
 *   - Pekerja 14-21: 1 jam (BISA - baru 1 jam)
 *   - Pekerja 22-31: 0 jam (BISA)
 * - Assign Kupu Pagi: Pekerja 14-21 (8 orang) + Pekerja 22-39 (18 orang) = 26 ✅
 * 
 * HASIL:
 * - Pekerja 1-13: 2 jam (Lightrap only)
 * - Pekerja 14-21: 2 jam (Recolonisasi 1 jam + Kupu Pagi 1 jam)
 * - Pekerja 22-39: 1 jam (Kupu Pagi only)
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
    excludeWeekends = true,
    maxHoursPerDay = 2
  } = options
  
  // Filter pekerja & overtime
  const selectedPekerja = pekerjaList.filter(p => selectedPekerjaIds.includes(p.id))
  const selectedOvertime = jenisOvertimeList.filter(ot => selectedOvertimeIds.includes(ot.id))
  
  if (selectedPekerja.length === 0 || selectedOvertime.length === 0) {
    throw new Error('Pilih minimal 1 pekerja dan 1 jenis overtime')
  }

  // Hitung hari kerja (auto skip Minggu & tanggal merah)
  console.log('=== INPUT DATES ===')
  console.log('startDate:', startDate, startDate.toISOString ? startDate.toISOString() : 'not a date object')
  console.log('endDate:', endDate, endDate.toISOString ? endDate.toISOString() : 'not a date object')
  
  const workDays = excludeWeekends 
    ? getWorkDays(startDate, endDate)
    : getAllDays(startDate, endDate)
  
  const totalWorkDays = workDays.length
  
  console.log('=== WORK DAYS ===')
  console.log('Total:', totalWorkDays)
  console.log('First:', workDays[0] ? format(workDays[0], 'yyyy-MM-dd') : 'none')
  console.log('Last:', workDays[totalWorkDays - 1] ? format(workDays[totalWorkDays - 1], 'yyyy-MM-dd') : 'none')
  console.log('===================')
  
  if (totalWorkDays === 0) {
    throw new Error('Tidak ada hari kerja dalam periode yang dipilih (semua Minggu/libur)')
  }
  
  // ========================================
  // FETCH EXISTING ASSIGNMENTS (PENTING!)
  // ========================================
  const existingWorkloadMap = await fetchExistingAssignments(
    startDate, 
    endDate, 
    selectedPekerjaIds
  )
  
  const schedules: any[] = []
  
  // Process setiap jenis overtime
  for (const jenisOT of selectedOvertime) {
    const alokasi = jenisOT.alokasi_pekerja
    const totalPekerja = selectedPekerja.length
    const durasiJam = jenisOT.durasi_jam
    
    console.log(`\n=== PROCESSING: ${jenisOT.nama} (${durasiJam} jam) ===`)
    console.log(`Alokasi: ${alokasi} pekerja per hari`)
    console.log(`Max hours per day: ${maxHoursPerDay} jam`)
    
    // Target JAM OT per pekerja (BUKAN hari!)
    const totalJamOT = totalWorkDays * alokasi * durasiJam
    const targetJamPerPerson = totalJamOT / totalPekerja
    
    // Track JAM OT (bukan jumlah hari)
    const jamOTTracker: { [pekerjaId: string]: number } = {}
    selectedPekerja.forEach(p => { jamOTTracker[p.id] = 0 })
    
    // Temporary schedule
    const tempSchedule: { [tanggal: string]: Pekerja[] } = {}
    
    // ========================================
    // FASE 1: Round-Robin dengan Interval + MAX HOURS CHECK
    // ========================================
    
    let pekerjaStartIndex = 0
    let currentPeriod = 0
    
    for (let dayIndex = 0; dayIndex < totalWorkDays; dayIndex++) {
      // Ganti periode setiap intervalDays
      if (dayIndex > 0 && dayIndex % intervalDays === 0) {
        currentPeriod++
        pekerjaStartIndex += alokasi
      }
      
      const currentDate = workDays[dayIndex]
      const tanggal = format(currentDate, 'yyyy-MM-dd')
      
      // Get existing workload untuk hari ini
      const existingWorkload = existingWorkloadMap[tanggal] || {}
      
      // Pilih pekerja untuk hari ini
      const periodPekerja: Pekerja[] = []
      let attempts = 0
      const maxAttempts = totalPekerja * 2 // Prevent infinite loop
      
      for (let i = 0; i < alokasi && attempts < maxAttempts; i++) {
        attempts++
        
        let pekerja = selectedPekerja[(pekerjaStartIndex + i) % totalPekerja]
        
        // CHECK: Apakah pekerja ini sudah >= maxHoursPerDay?
        const currentDailyWorkload = existingWorkload[pekerja.id] || 0
        
        if (currentDailyWorkload + durasiJam > maxHoursPerDay) {
          // SKIP - sudah max!
          console.log(`[${tanggal}] Skip ${pekerja.nama}: sudah ${currentDailyWorkload} jam (max ${maxHoursPerDay})`)
          
          // Cari pengganti: pekerja dengan workload paling sedikit yang belum max
          const sortedByWorkload = selectedPekerja
            .filter(p => {
              const dailyWorkload = existingWorkload[p.id] || 0
              const alreadyAssigned = periodPekerja.some(ap => ap.id === p.id)
              return !alreadyAssigned && (dailyWorkload + durasiJam <= maxHoursPerDay)
            })
            .sort((a, b) => {
              const aDaily = existingWorkload[a.id] || 0
              const bDaily = existingWorkload[b.id] || 0
              if (aDaily !== bDaily) return aDaily - bDaily
              return jamOTTracker[a.id] - jamOTTracker[b.id]
            })
          
          if (sortedByWorkload.length > 0) {
            pekerja = sortedByWorkload[0]
            console.log(`[${tanggal}] Ganti dengan ${pekerja.nama}: ${existingWorkload[pekerja.id] || 0} jam`)
          } else {
            console.warn(`[${tanggal}] TIDAK ADA pekerja yang available! (semua sudah >= ${maxHoursPerDay} jam)`)
            // Skip slot ini
            continue
          }
        }
        
        periodPekerja.push(pekerja)
        
        // Update existing workload map (untuk iterasi selanjutnya dalam hari yang sama)
        if (!existingWorkload[pekerja.id]) {
          existingWorkload[pekerja.id] = 0
        }
        existingWorkload[pekerja.id] += durasiJam
      }
      
      // Assign
      tempSchedule[tanggal] = [...periodPekerja]
      
      // Update JAM OT tracker
      periodPekerja.forEach(p => {
        jamOTTracker[p.id] += durasiJam
      })
      
      console.log(`[${tanggal}] Assigned ${periodPekerja.length} pekerja`)
    }
    
    // ========================================
    // FASE 2: Auto-Balance berdasarkan JAM OT
    // ========================================
    
    const sortedByJam = Object.entries(jamOTTracker)
      .sort(([, jamA], [, jamB]) => jamA - jamB)
    
    const minJam = sortedByJam[0][1]
    const maxJam = sortedByJam[sortedByJam.length - 1][1]
    const gapJam = maxJam - minJam
    
    console.log(`\nJam OT range: ${minJam} - ${maxJam} jam (gap: ${gapJam} jam)`)
    console.log(`Target per person: ${targetJamPerPerson.toFixed(1)} jam`)
    
    // Balance jika gap > 1 hari OT
    if (gapJam > durasiJam) {
      console.log('Auto-balancing...')
      
      const underAssigned = sortedByJam
        .filter(([, jam]) => jam < targetJamPerPerson)
        .map(([id]) => id)
      
      const overAssigned = sortedByJam
        .filter(([, jam]) => jam > targetJamPerPerson)
        .map(([id]) => id)
      
      console.log(`Under-assigned: ${underAssigned.length} pekerja`)
      console.log(`Over-assigned: ${overAssigned.length} pekerja`)
      
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
          
          if (!dayAssignments) continue
          
          // Get existing workload untuk tanggal ini
          const existingWorkload = existingWorkloadMap[tanggal] || {}
          const underPekerjaCurrentWorkload = existingWorkload[underId] || 0
          
          // Check: Apakah underPekerja bisa ditambah di hari ini?
          if (underPekerjaCurrentWorkload + durasiJam > maxHoursPerDay) {
            // Skip - sudah max untuk hari ini
            continue
          }
          
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
              console.log(`[${tanggal}] Replace ${currentPekerja.nama} → ${underPekerja.nama}`)
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
    
    console.log(`Generated ${Object.keys(tempSchedule).length} days of schedules`)
    console.log('=================================\n')
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