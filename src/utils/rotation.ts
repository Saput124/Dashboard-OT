import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { getWorkDays } from './holidays'
import type { JenisOvertime, Pekerja } from '../types'

interface GenerateOptions {
  startDate: Date
  endDate: Date
  selectedPekerjaIds: string[]
  selectedOvertimeIds: string[]
  intervalDays?: number
  excludeWeekends?: boolean
  maxHoursPerDay?: number
  // ⭐ NEW: Sunday Schedule Options
  sundayOvertimeIds?: string[]
  generateSundaySchedule?: boolean
}

const fetchExistingAssignments = async (
  startDate: Date, 
  endDate: Date, 
  pekerjaIds: string[]
): Promise<{ [tanggal: string]: { [pekerjaId: string]: number } }> => {
  const startDateStr = format(startDate, 'yyyy-MM-dd')
  const endDateStr = format(endDate, 'yyyy-MM-dd')
  
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
  console.log('Dates with assignments:', Object.keys(dailyWorkloadMap).length)
  console.log('============================')
  
  return dailyWorkloadMap
}

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
    maxHoursPerDay = 2,
    // ⭐ NEW
    sundayOvertimeIds = [],
    generateSundaySchedule = false
  } = options
  
  const selectedPekerja = pekerjaList.filter(p => selectedPekerjaIds.includes(p.id))
  const selectedOvertime = jenisOvertimeList.filter(ot => selectedOvertimeIds.includes(ot.id))
  
  if (selectedPekerja.length === 0 || selectedOvertime.length === 0) {
    throw new Error('Pilih minimal 1 pekerja dan 1 jenis overtime')
  }

  // ⭐ NEW: Pisahkan weekday dan Sunday overtime
  const weekdayOvertime = selectedOvertime.filter(ot => 
    !sundayOvertimeIds.includes(ot.id)
  )
  
  const sundayOvertime = jenisOvertimeList.filter(ot => 
    sundayOvertimeIds.includes(ot.id)
  )

  console.log('=== OVERTIME BREAKDOWN ===')
  console.log('Weekday OT:', weekdayOvertime.map(o => o.nama))
  console.log('Sunday OT:', sundayOvertime.map(o => o.nama))
  console.log('==========================')

  // ⭐ NEW: Separate workdays and Sundays
  const allDays = getAllDays(startDate, endDate)
  const sundayDates = allDays.filter(d => d.getDay() === 0)
  const workDays = excludeWeekends
    ? getWorkDays(startDate, endDate)
    : allDays.filter(d => d.getDay() !== 0)
  
  const totalWorkDays = workDays.length

  console.log('=== DAYS BREAKDOWN ===')
  console.log('Total days:', allDays.length)
  console.log('Sundays:', sundayDates.length)
  console.log('Workdays:', totalWorkDays)
  console.log('======================')
  
  if (totalWorkDays === 0 && sundayDates.length === 0) {
    throw new Error('Tidak ada hari dalam periode yang dipilih')
  }
  
  const existingWorkloadMap = await fetchExistingAssignments(
    startDate, 
    endDate, 
    selectedPekerjaIds
  )
  
  const schedules: any[] = []
  
  // ========================================
  // WEEKDAY PROCESSING
  // ========================================
  console.log('\n=== PROCESSING WEEKDAY SCHEDULES ===')
  
  for (const jenisOT of weekdayOvertime) {
    const alokasi = jenisOT.alokasi_pekerja
    const totalPekerja = selectedPekerja.length
    const durasiJam = jenisOT.durasi_jam
    
    console.log(`\nProcessing: ${jenisOT.nama} (${durasiJam} jam, ${alokasi} pekerja)`)
    
    const jamOTTracker: { [pekerjaId: string]: number } = {}
    const assignedDaysCount: { [pekerjaId: string]: number } = {}
    selectedPekerja.forEach(p => {
      jamOTTracker[p.id] = 0
      assignedDaysCount[p.id] = 0
    })
    
    const tempSchedule: { [tanggal: string]: Pekerja[] } = {}
    let currentRotationGroup = 0
    
    for (let dayIndex = 0; dayIndex < totalWorkDays; dayIndex++) {
      if (dayIndex > 0 && dayIndex % intervalDays === 0) {
        currentRotationGroup++
      }
      
      const currentDate = workDays[dayIndex]
      const tanggal = format(currentDate, 'yyyy-MM-dd')
      
      const existingWorkload = existingWorkloadMap[tanggal] || {}
      
      console.log(`\n[${tanggal}] Assigning ${alokasi} pekerja...`)
      console.log(`Existing workload:`, Object.keys(existingWorkload).length, 'pekerja')
      
      const availablePool = selectedPekerja
        .filter(p => {
          const currentDailyWorkload = existingWorkload[p.id] || 0
          return (currentDailyWorkload + durasiJam) <= maxHoursPerDay
        })
        .sort((a, b) => {
          const aDailyWorkload = existingWorkload[a.id] || 0
          const bDailyWorkload = existingWorkload[b.id] || 0
          if (aDailyWorkload !== bDailyWorkload) {
            return aDailyWorkload - bDailyWorkload
          }
          
          if (assignedDaysCount[a.id] !== assignedDaysCount[b.id]) {
            return assignedDaysCount[a.id] - assignedDaysCount[b.id]
          }
          
          return jamOTTracker[a.id] - jamOTTracker[b.id]
        })
      
      console.log(`Available pool: ${availablePool.length} pekerja`)
      
      if (availablePool.length < alokasi) {
        console.warn(`⚠️ Only ${availablePool.length} available, need ${alokasi}`)
      }
      
      const periodPekerja = availablePool.slice(0, alokasi)
      
      if (periodPekerja.length === 0) {
        console.error(`❌ NO workers available for ${tanggal}`)
        continue
      }
      
      console.log(`✅ Assigned ${periodPekerja.length} pekerja`)
      
      tempSchedule[tanggal] = [...periodPekerja]
      
      periodPekerja.forEach(p => {
        jamOTTracker[p.id] += durasiJam
        assignedDaysCount[p.id] += 1
        
        if (!existingWorkload[p.id]) {
          existingWorkload[p.id] = 0
        }
        existingWorkload[p.id] += durasiJam
      })
      
      existingWorkloadMap[tanggal] = existingWorkload
    }
    
    // Convert to schedules
    Object.entries(tempSchedule).forEach(([tanggal, assignedPekerja]) => {
      const currentDate = workDays.find(d => format(d, 'yyyy-MM-dd') === tanggal)!
      const dayIndex = workDays.indexOf(currentDate)
      const grupRotasi = Math.floor(dayIndex / intervalDays) + 1
      
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
    
    console.log(`Generated ${Object.keys(tempSchedule).length} weekday schedules`)
  }
  
  // ========================================
  // ⭐ SUNDAY PROCESSING
  // ========================================
  if (generateSundaySchedule && sundayOvertime.length > 0 && sundayDates.length > 0) {
    console.log('\n=== PROCESSING SUNDAY SCHEDULES ===')
    
    for (const jenisOT of sundayOvertime) {
      const alokasi = jenisOT.alokasi_pekerja
      const durasiJam = jenisOT.durasi_jam
      
      console.log(`\nSunday OT: ${jenisOT.nama} (${durasiJam} jam, ${alokasi} pekerja)`)
      
      const sundayWorkload: { [pekerjaId: string]: number } = {}
      selectedPekerja.forEach(p => { sundayWorkload[p.id] = 0 })
      
      for (let i = 0; i < sundayDates.length; i++) {
        const sundayDate = sundayDates[i]
        const tanggal = format(sundayDate, 'yyyy-MM-dd')
        
        console.log(`\n[${tanggal}] Sunday - Assigning ${alokasi} pekerja...`)
        
        const existingWorkload = existingWorkloadMap[tanggal] || {}
        
        // Priority: least Sunday assignments, then least total workload
        const availablePool = selectedPekerja
          .sort((a, b) => {
            if (sundayWorkload[a.id] !== sundayWorkload[b.id]) {
              return sundayWorkload[a.id] - sundayWorkload[b.id]
            }
            const aTotalWorkload = (existingWorkload[a.id] || 0)
            const bTotalWorkload = (existingWorkload[b.id] || 0)
            return aTotalWorkload - bTotalWorkload
          })
        
        const assignedPekerja = availablePool.slice(0, alokasi)
        
        console.log(`✅ Assigned ${assignedPekerja.length} pekerja for Sunday`)
        
        assignedPekerja.forEach(p => {
          sundayWorkload[p.id] += durasiJam
        })
        
        schedules.push({
          tanggal,
          jenis_overtime_id: jenisOT.id,
          grup_rotasi: 0,
          is_minggu: true,
          durasi_jam: jenisOT.durasi_jam,
          assigned_pekerja: assignedPekerja,
          jenis_overtime: jenisOT
        })
      }
    }
    
    console.log('=== SUNDAY SCHEDULES COMPLETED ===')
  }
  
  schedules.sort((a, b) => a.tanggal.localeCompare(b.tanggal))
  
  console.log(`\n=== TOTAL SCHEDULES GENERATED: ${schedules.length} ===\n`)
  
  return schedules
}

// Helper function
const getAllDays = (startDate: Date, endDate: Date): Date[] => {
  const days: Date[] = []
  const current = new Date(startDate)
  
  while (current <= endDate) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  
  return days
}

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
  const dayNames = {
    'Sunday': 'Minggu',
    'Monday': 'Senin',
    'Tuesday': 'Selasa',
    'Wednesday': 'Rabu',
    'Thursday': 'Kamis',
    'Friday': 'Jumat',
    'Saturday': 'Sabtu'
  }
  const englishDay = format(new Date(date), 'EEEE')
  return dayNames[englishDay as keyof typeof dayNames] || englishDay
}

export const getShortDayName = (date: string | Date) => {
  const dayNames = {
    'Sun': 'Min',
    'Mon': 'Sen',
    'Tue': 'Sel',
    'Wed': 'Rab',
    'Thu': 'Kam',
    'Fri': 'Jum',
    'Sat': 'Sab'
  }
  const englishDay = format(new Date(date), 'EEE')
  return dayNames[englishDay as keyof typeof dayNames] || englishDay
}