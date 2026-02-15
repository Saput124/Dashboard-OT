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
 * Algoritma Smart Assignment dengan MAX HOURS PER DAY CONSTRAINT
 * 
 * TUJUAN: 
 * 1. Distribusi JAM OT yang merata untuk semua pekerja
 * 2. BATASAN: Maksimal 2 jam OT per hari per pekerja
 * 3. SUPPORT: Multi-generate (Lightrap + Recolonisasi + Kupu Pagi dalam periode sama)
 * 
 * CARA KERJA:
 * 1. Fetch existing assignments dari database
 * 2. Untuk setiap hari:
 *    a. Build available pool (pekerja yang bisa ditambah: currentWorkload + durasi <= maxHours)
 *    b. Sort by priority: daily workload → assignment count → total jam
 *    c. Assign dari pool (ambil top N)
 * 3. Skip auto-balance jika multi-generate (untuk avoid conflict)
 * 
 * CONTOH MULTI-GENERATE:
 * 
 * Generate 1 (Lightrap 2 jam, alokasi 13):
 * - Pilih 31 pekerja
 * - 16 Feb: Pekerja 1-13 → 2 jam
 * - Save to database
 * 
 * Generate 2 (Kupu Pagi 1 jam, alokasi 26):
 * - Pilih 39 pekerja (31 dari Lightrap + 8 tambahan)
 * - Fetch existing: Pekerja 1-13 = 2 jam
 * - Build pool 16 Feb:
 *   - Pekerja 1-13: 2+1=3 jam > 2 → SKIP ❌
 *   - Pekerja 14-39: 0+1=1 jam <= 2 → AVAILABLE ✅ (26 pekerja)
 * - Assign: Pekerja 14-39 (26 pekerja) ✅
 * 
 * HASIL:
 * - Pekerja 1-13:  2 jam (Lightrap only)
 * - Pekerja 14-39: 1 jam (Kupu Pagi only)
 * - TIDAK ADA yang > 2 jam! ✅
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
    // FASE 1: Smart Assignment dengan Prioritas Available Workers
    // ========================================
    // TIDAK PAKAI strict round-robin index!
    // Prioritas: pekerja yang BISA ditambah (< maxHours)
    
    let currentRotationGroup = 0
    const assignedDaysCount: { [pekerjaId: string]: number } = {}
    selectedPekerja.forEach(p => { assignedDaysCount[p.id] = 0 })
    
    for (let dayIndex = 0; dayIndex < totalWorkDays; dayIndex++) {
      // Ganti grup setiap intervalDays (optional - untuk variety)
      if (dayIndex > 0 && dayIndex % intervalDays === 0) {
        currentRotationGroup++
      }
      
      const currentDate = workDays[dayIndex]
      const tanggal = format(currentDate, 'yyyy-MM-dd')
      
      // Get existing workload untuk hari ini
      const existingWorkload = existingWorkloadMap[tanggal] || {}
      
      console.log(`\n[${tanggal}] Assigning ${alokasi} pekerja...`)
      console.log(`Existing workload:`, Object.keys(existingWorkload).length, 'pekerja sudah ada OT')
      
      // Build pool pekerja yang BISA ditambah
      const availablePool = selectedPekerja
        .filter(p => {
          const currentDailyWorkload = existingWorkload[p.id] || 0
          return (currentDailyWorkload + durasiJam) <= maxHoursPerDay
        })
        .sort((a, b) => {
          // Sort by:
          // 1. Daily workload (ascending) - yang paling sedikit hari ini
          const aDailyWorkload = existingWorkload[a.id] || 0
          const bDailyWorkload = existingWorkload[b.id] || 0
          if (aDailyWorkload !== bDailyWorkload) {
            return aDailyWorkload - bDailyWorkload
          }
          
          // 2. Assignment count (ascending) - yang paling jarang dapat
          if (assignedDaysCount[a.id] !== assignedDaysCount[b.id]) {
            return assignedDaysCount[a.id] - assignedDaysCount[b.id]
          }
          
          // 3. Total jam OT (ascending)
          return jamOTTracker[a.id] - jamOTTracker[b.id]
        })
      
      console.log(`Available pool: ${availablePool.length} pekerja`)
      
      if (availablePool.length < alokasi) {
        console.warn(`⚠️ WARNING: Hanya ${availablePool.length} pekerja available, butuh ${alokasi}!`)
        console.warn(`   Kemungkinan: terlalu banyak pekerja sudah >= ${maxHoursPerDay} jam hari ini`)
      }
      
      // Assign dari available pool
      const periodPekerja = availablePool.slice(0, alokasi)
      
      if (periodPekerja.length === 0) {
        console.error(`❌ TIDAK ADA pekerja available untuk ${tanggal}!`)
        console.error(`   Semua pekerja sudah >= ${maxHoursPerDay} jam`)
        // Skip hari ini
        continue
      }
      
      console.log(`✅ Assigned ${periodPekerja.length} pekerja`)
      
      // Assign
      tempSchedule[tanggal] = [...periodPekerja]
      
      // Update trackers
      periodPekerja.forEach(p => {
        jamOTTracker[p.id] += durasiJam
        assignedDaysCount[p.id] += 1
        
        // Update existing workload map untuk hari ini
        if (!existingWorkload[p.id]) {
          existingWorkload[p.id] = 0
        }
        existingWorkload[p.id] += durasiJam
      })
      
      // Update map untuk next iteration
      existingWorkloadMap[tanggal] = existingWorkload
    }
    
    // ========================================
    // FASE 2: Auto-Balance berdasarkan JAM OT
    // ========================================
    // Disabled untuk multi-generate scenario karena bisa conflict dengan existing assignments
    // Auto-balance hanya efektif untuk single generate
    
    const sortedByJam = Object.entries(jamOTTracker)
      .sort(([, jamA], [, jamB]) => jamA - jamB)
    
    if (sortedByJam.length > 0) {
      const minJam = sortedByJam[0][1]
      const maxJam = sortedByJam[sortedByJam.length - 1][1]
      const gapJam = maxJam - minJam
      
      console.log(`\nJam OT range: ${minJam} - ${maxJam} jam (gap: ${gapJam} jam)`)
      console.log(`Target per person: ${targetJamPerPerson.toFixed(1)} jam`)
      
      // Only balance if gap is significant AND we're not in multi-generate scenario
      // (Skip balance if there are existing assignments - menghindari conflict)
      const hasExistingAssignments = Object.keys(existingWorkloadMap).length > 0
      
      if (gapJam > durasiJam * 2 && !hasExistingAssignments) {
        console.log('Auto-balancing... (single generate mode)')
        
        const underAssigned = sortedByJam
          .filter(([, jam]) => jam < targetJamPerPerson - durasiJam)
          .map(([id]) => id)
        
        const overAssigned = sortedByJam
          .filter(([, jam]) => jam > targetJamPerPerson + durasiJam)
          .map(([id]) => id)
        
        console.log(`Under-assigned: ${underAssigned.length} pekerja`)
        console.log(`Over-assigned: ${overAssigned.length} pekerja`)
        
        // Replace logic (simplified - untuk single generate saja)
        let balanceCount = 0
        for (const underId of underAssigned.slice(0, 5)) { // Limit to 5 replacements
          const underPekerja = selectedPekerja.find(p => p.id === underId)!
          
          for (let i = workDays.length - 1; i >= 0 && balanceCount < 10; i--) {
            const tanggal = format(workDays[i], 'yyyy-MM-dd')
            const dayAssignments = tempSchedule[tanggal]
            
            if (!dayAssignments) continue
            
            for (let j = 0; j < dayAssignments.length; j++) {
              const currentPekerja = dayAssignments[j]
              
              if (
                overAssigned.includes(currentPekerja.id) &&
                currentPekerja.id !== underId &&
                !dayAssignments.some(p => p.id === underId) &&
                jamOTTracker[currentPekerja.id] > targetJamPerPerson
              ) {
                dayAssignments[j] = underPekerja
                jamOTTracker[currentPekerja.id] -= durasiJam
                jamOTTracker[underId] += durasiJam
                balanceCount++
                console.log(`[${tanggal}] Balance: ${currentPekerja.nama} → ${underPekerja.nama}`)
                break
              }
            }
          }
        }
        
        console.log(`Completed ${balanceCount} balance operations`)
      } else if (hasExistingAssignments) {
        console.log('Skipping auto-balance (multi-generate scenario detected)')
      } else {
        console.log('Skipping auto-balance (gap acceptable)')
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